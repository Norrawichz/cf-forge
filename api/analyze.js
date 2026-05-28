export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { rating, rank, weakTopics, tagStats } = req.body;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY not configured" });

  const weakList = weakTopics.length
    ? weakTopics.map((t) => `${t.tag} (${Math.round(t.success * 100)}% success rate)`).join(", ")
    : "not enough data yet";

  const topTags = tagStats
    .slice(0, 20)
    .map((t) => `${t.tag}: ${t.solved} solved, ${Math.round(t.success * 100)}% success`)
    .join("\n");

  const prompt = `You are a Codeforces competitive programming coach.

User profile:
- Rating: ${rating} (${rank})
- Weakest topics: ${weakList}
- Topic performance:
${topTags}

Provide a personalized learning path and analysis. Respond ONLY with valid JSON (no markdown, no extra text):
{
  "analysis": "2-3 sentence analysis of their weaknesses and what to focus on",
  "learningPath": [
    { "priority": 1, "topic": "topic name", "reason": "why this topic first" },
    { "priority": 2, "topic": "topic name", "reason": "brief reason" },
    { "priority": 3, "topic": "topic name", "reason": "brief reason" },
    { "priority": 4, "topic": "topic name", "reason": "brief reason" },
    { "priority": 5, "topic": "topic name", "reason": "brief reason" }
  ]
}`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return res.status(500).json({ error: "Groq API error", details: err });
    }

    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: "Invalid response from Groq" });

    res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
