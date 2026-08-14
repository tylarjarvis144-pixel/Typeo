module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { raw, tone } = req.body || {};
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "Missing 'raw' text" });
    return;
  }
  const safeTone =
    typeof tone === "string" && tone.trim()
      ? tone.trim()
      : "a clear, professional message";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });
    return;
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        system:
          "You are the cleanup engine for a voice-dictation tool. You receive a raw speech-to-text transcript that may contain filler words (um, uh, like, you know), false starts, repeated words, and mid-sentence self-corrections. Rewrite it into clean, correctly punctuated, natural written text. Rules: preserve the speaker's meaning and intent exactly; never add facts, details, or content the speaker did not say; remove fillers and repetition; when the speaker corrects themselves, keep only their final intended version; format as a list or steps only if they clearly dictated one. Output ONLY the finished text — no preamble, no quotation marks, no commentary.",
        messages: [
          {
            role: "user",
            content: `Rewrite this as ${safeTone}.\n\nRaw transcript:\n${raw}`,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text();
      res
        .status(anthropicRes.status)
        .json({ error: `Anthropic API error (${anthropicRes.status})`, detail });
      return;
    }

    const data = await anthropicRes.json();
    const text = (data.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    if (!text) {
      res.status(502).json({ error: "Empty response from model" });
      return;
    }

    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: "Proxy request failed", detail: err.message });
  }
};
