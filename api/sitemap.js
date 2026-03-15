export default async function handler(req, res) {
  const MEMORIAL_BASE = "https://memorial.rememberingollie.com";
  const API_URL = "https://rollieorder-xdvfbmbh.manus.space/api/memorial-sitemap-data";
  const API_KEY = process.env.SONG_LIBRARY_API_KEY;

  try {
    if (!API_KEY ) {
      console.error("[Sitemap] SONG_LIBRARY_API_KEY not configured");
      return res.status(500).send("Sitemap temporarily unavailable");
    }

    const response = await fetch(API_URL, {
      headers: { "x-api-key": API_KEY },
    });

    if (!response.ok) {
      console.error("[Sitemap] API returned status:", response.status);
      return res.status(502).send("Failed to fetch sitemap data");
    }

    const data = await response.json();

    if (!data.success || !Array.isArray(data.entries)) {
      console.error("[Sitemap] Invalid API response:", data);
      return res.status(502).send("Invalid sitemap data");
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `  <url>\n    <loc>${MEMORIAL_BASE}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

    for (const entry of data.entries ) {
      xml += `  <url>\n`;
      xml += `    <loc>${MEMORIAL_BASE}/${entry.externalOrderId}.html</loc>\n`;
      xml += `    <lastmod>${entry.updatedAt}</lastmod>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(xml);
  } catch (error) {
    console.error("[Sitemap] Error:", error);
    return res.status(500).send("Failed to generate sitemap");
  }
}
