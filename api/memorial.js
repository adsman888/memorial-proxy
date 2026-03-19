/**
 * Vercel Serverless Function — Memorial Page Proxy
 * 
 * Looks up the versioned URL from the Rollie Order App API for every request.
 * This ensures that regenerated memorial pages are served immediately.
 * 
 * Handles:
 *   - /abc-123        (externalOrderId, no extension)
 *   - /abc-123.html   (externalOrderId, with extension)
 *   - /charlie         (customUrlSlug, no extension)
 *   - /charlie.html    (customUrlSlug, with extension)
 */
export default async function handler(req, res) {
  const API_URL = "https://rollieorder-xdvfbmbh.manus.space/api/memorial-lookup";
  const API_KEY = process.env.SONG_LIBRARY_API_KEY;
  // CloudFront base for fallback (canonical key)
  const S3_BASE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663317797962/XdvfbMbHhdR6a9owVrzwKx/memorials";

  // Extract the slug from the URL path (e.g., /charlie → charlie, /abc-123.html → abc-123.html)
  const rawSlug = req.url.replace(/^\//, "").replace(/\?.*$/, "");

  if (!rawSlug || rawSlug === "" || rawSlug === "index.html") {
    // Root path — redirect to main site
    return res.redirect(302, "https://www.rememberingollie.com");
  }

  // Skip known static files (favicon, robots.txt, etc.) — redirect to S3
  if (/\.(ico|txt|png|jpg|jpeg|gif|svg|css|js|xml|json|webp|woff2?)$/i.test(rawSlug)) {
    return res.redirect(302, `${S3_BASE}/${rawSlug}`);
  }

  // Normalize: strip .html extension for the API lookup (API handles both formats)
  const slug = rawSlug.replace(/\.html$/, "");

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
 * Tries both {slug}.html and {slug}/index.html patterns.
 */
async function proxyFromS3(res, slug) {
  const S3_BASE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663317797962/XdvfbMbHhdR6a9owVrzwKx/memorials";

  // Try the .html version first (canonical key pattern)
  const urlsToTry = [
    `${S3_BASE}/${slug}.html`,
    `${S3_BASE}/${slug}/index.html`,
  ];

  for (const url of urlsToTry) {
    try {
      const htmlResponse = await fetch(url);
      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=300");
        res.setHeader("X-Memorial-Source", "s3-fallback");
        return res.status(200).send(html);
      }
    } catch (e) {
      // Try next URL
    }
  }

  // Nothing found — return 404
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
