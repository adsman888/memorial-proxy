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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Memorial Not Found — Remembering Ollie</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background-color: #FAF6EE;
      background-image: radial-gradient(ellipse at 20% 0%, rgba(196,146,58,0.04) 0%, transparent 60%),
                        radial-gradient(ellipse at 80% 100%, rgba(196,146,58,0.03) 0%, transparent 60%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #6B5A3E;
      -webkit-font-smoothing: antialiased;
      padding: 40px 20px;
    }
    .logo-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      margin-bottom: 40px;
    }
    .logo-img {
      width: 32px; height: 32px; border-radius: 50%;
    }
    .logo-text {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 16px;
      color: #8B7D6B;
      font-weight: 500;
    }
    .card {
      background: rgba(255,255,255,0.65);
      border: 1px solid #E5D5B5;
      border-radius: 20px;
      padding: 48px 40px;
      max-width: 440px;
      text-align: center;
      box-shadow: 0 4px 24px rgba(90,74,50,0.08);
    }
    .paw {
      font-size: 48px;
      margin-bottom: 20px;
      opacity: 0.3;
    }
    h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 26px;
      font-weight: 400;
      color: #4A3C2A;
      margin-bottom: 12px;
      font-style: italic;
    }
    p {
      font-size: 14px;
      line-height: 1.7;
      color: #8B7D6B;
      margin-bottom: 28px;
      font-weight: 300;
    }
    .btn {
      display: inline-block;
      background: #C4923A;
      color: white;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      font-weight: 500;
      padding: 12px 28px;
      border-radius: 999px;
      text-decoration: none;
      transition: background 0.2s;
    }
    .btn:hover { background: #D4A85C; }
    .footer {
      margin-top: 40px;
      font-size: 12px;
      color: #C4B5A5;
      font-style: italic;
    }
    .footer a { color: #C4923A; text-decoration: none; }
  </style>
</head>
<body>
  <a class="logo-link" href="https://www.rememberingollie.com">
    <img class="logo-img" src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663317797962/iAaISSkCwlQLMLjm.png" alt="Remembering Ollie">
    <span class="logo-text">Remembering Ollie</span>
  </a>
  <div class="card">
    <div class="paw">&#128062;</div>
    <h1>Memorial Not Found</h1>
    <p>This memorial page may not have been created yet, or the link may be incorrect. Every pet deserves to be remembered.</p>
    <a class="btn" href="https://www.rememberingollie.com">Create a Memorial Song</a>
  </div>
  <p class="footer">
    Made with love by <a href="https://www.rememberingollie.com">Remembering Ollie</a>
  </p>
</body>
</html>
  `);
}
