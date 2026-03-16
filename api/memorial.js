/**
 * Vercel Serverless Function — Memorial Page Proxy
 * 
 * Instead of a static rewrite to the canonical S3 key (which gets CDN-cached),
 * this function looks up the versioned URL from the Rollie Order App API.
 * This ensures that regenerated memorial pages are served immediately.
 * 
 * Handles both:
 *   - /abc-123.html (externalOrderId)
 *   - /buddys-page.html (customUrlSlug)
 */
export default async function handler(req, res) {
  const API_URL = "https://rollieorder-xdvfbmbh.manus.space/api/memorial-lookup";
  const API_KEY = process.env.SONG_LIBRARY_API_KEY;
  // CloudFront base for fallback (canonical key)
  const S3_BASE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663317797962/XdvfbMbHhdR6a9owVrzwKx/memorials";

  // Extract the slug from the URL path (e.g., /abc-123.html → abc-123.html)
  const slug = req.url.replace(/^\//, "").replace(/\?.*$/, "");

  if (!slug || slug === "" || slug === "index.html") {
    // Root path — redirect to main site
    return res.redirect(302, "https://www.rememberingollie.com");
  }

  // Skip non-HTML requests (favicon, robots.txt, etc.)
  if (!slug.endsWith(".html")) {
    return res.redirect(302, `${S3_BASE}/${slug}`);
  }

  try {
    if (!API_KEY) {
      console.error("[Memorial Proxy] SONG_LIBRARY_API_KEY not configured, falling back to S3");
      return proxyFromS3(res, slug);
    }

    // Look up the versioned URL from the Rollie Order App API
    const lookupResponse = await fetch(`${API_URL}/${slug}`, {
      headers: { "x-api-key": API_KEY },
    });

    if (!lookupResponse.ok) {
      console.warn(`[Memorial Proxy] Lookup failed for ${slug}: ${lookupResponse.status}`);
      // Fall back to canonical S3 key
      return proxyFromS3(res, slug);
    }

    const data = await lookupResponse.json();

    if (!data.success || !data.url) {
      console.warn(`[Memorial Proxy] No URL found for ${slug}`);
      return proxyFromS3(res, slug);
    }

    // Fetch the versioned HTML from S3
    const htmlResponse = await fetch(data.url);

    if (!htmlResponse.ok) {
      console.warn(`[Memorial Proxy] Versioned URL fetch failed: ${data.url}`);
      return proxyFromS3(res, slug);
    }

    const html = await htmlResponse.text();

    // Serve with short cache to allow quick updates after regeneration
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
    res.setHeader("X-Memorial-Source", "versioned");
    return res.status(200).send(html);
  } catch (error) {
    console.error(`[Memorial Proxy] Error for ${slug}:`, error);
    return proxyFromS3(res, slug);
  }
}

/**
 * Fallback: proxy directly from S3/CloudFront canonical key.
 * Used when the API is unavailable or the lookup fails.
 */
async function proxyFromS3(res, slug) {
  const S3_BASE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663317797962/XdvfbMbHhdR6a9owVrzwKx/memorials";

  try {
    const htmlResponse = await fetch(`${S3_BASE}/${slug}`);

    if (!htmlResponse.ok) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><title>Memorial Not Found</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:60px;background:#1a1a2e;color:#e0d5c1;">
          <h1>Memorial Page Not Found</h1>
          <p>This memorial page may not exist yet or has been removed.</p>
          <a href="https://www.rememberingollie.com" style="color:#d4a574;">Visit Remembering Ollie</a>
        </body></html>
      `);
    }

    const html = await htmlResponse.text();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=300");
    res.setHeader("X-Memorial-Source", "s3-fallback");
    return res.status(200).send(html);
  } catch (error) {
    console.error(`[Memorial Proxy] S3 fallback failed for ${slug}:`, error);
    return res.status(502).send("Memorial page temporarily unavailable");
  }
}
