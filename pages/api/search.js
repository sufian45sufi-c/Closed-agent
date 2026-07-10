export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 5,
        include_images: true,
      }),
    });

    if (!response.ok) {
      return res.status(200).json({ results: [], images: [], error: "Search unavailable right now." });
    }

    const data = await response.json();
    const results = (data.results || []).slice(0, 5).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));
    const images = (data.images || []).slice(0, 4);

    res.status(200).json({ results, images });
  } catch (err) {
    console.error(err);
    res.status(200).json({ results: [], images: [], error: "Search failed." });
  }
}
