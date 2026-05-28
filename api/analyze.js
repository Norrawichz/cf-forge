export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { rating, rank, weakTopics, tagStats } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  const weakList = weakTopics.length
    ? weakTopics.map((t) => `${t.tag} (สำเร็จ ${Math.round(t.success * 100)}%)`).join(", ")
    : "ยังไม่มีข้อมูลเพียงพอ";

  const topTags = tagStats
    .slice(0, 20)
    .map((t) => `${t.tag}: solved ${t.solved}, success ${Math.round(t.success * 100)}%`)
    .join("\n");

  const prompt = `You are a Codeforces competitive programming coach.

User: rating ${rating} (${rank})
Weak topics: ${weakList}
Topic stats:
${topTags}

Respond ONLY in valid JSON (no markdown, no code blocks) in Thai language:
{
  "analysis": "2-3 ประโยค วิเคราะห์จุดอ่อนและให้กำลังใจ",
  "learningPath": [
    { "priority": 1, "topic": "ชื่อ topic", "reason": "เหตุผลสั้นๆ ว่าทำไมต้องเรียนก่อน" },
    { "priority": 2, "topic": "...", "reason": "..." },
    { "priority": 3, "topic": "...", "reason": "..." },
    { "priority": 4, "topic": "...", "reason": "..." },
    { "priority": 5, "topic": "...", "reason": "..." }
  ]
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return res.status(500).json({ error: "Gemini error", details: err });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: "Invalid response from Gemini" });

    res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
