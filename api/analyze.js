export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { rating, rank, weakTopics, candidates } = req.body;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY not configured" });

  const weakList = weakTopics.length
    ? weakTopics.map((t) => `${t.tag} (${Math.round(t.success * 100)}% success)`).join(", ")
    : "none identified yet";

  const candidateList = candidates
    .map((p, i) => `${i + 1}. [${p.contestId}${p.index}] "${p.name}" rating=${p.rating} tags=${p.tags.join(",")}`)
    .join("\n");

  const prompt = `You are a Codeforces coach. Pick the 6 best problems for this user to solve next.

User: rating ${rating} (${rank}), weak topics: ${weakList}

Candidate problems:
${candidateList}

Rules:
- Prioritize problems that target the user's weak topics
- Mix difficulties: some just above rating, some a bit harder
- Pick variety of topics, not all the same tag

Respond ONLY with valid JSON, no extra text:
{
  "picks": [
    { "contestId": 123, "index": "A", "reason": "one sentence why this problem specifically" },
    { "contestId": 456, "index": "B", "reason": "..." },
    { "contestId": 789, "index": "C", "reason": "..." },
    { "contestId": 101, "index": "D", "reason": "..." },
    { "contestId": 112, "index": "E", "reason": "..." },
    { "contestId": 131, "index": "F", "reason": "..." }
  ]
}`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 600,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return res.status(500).json({ error: "Groq error", details: err });
    }

    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: "Invalid Groq response" });

    res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
