const SYSTEM_PROMPT = `
You are Nexus AI Web Developer.

You are an AI coding agent that helps users build websites.

The user sends a request and the current project files.

Return ONLY valid JSON in exactly this format:

{
  "message": "short explanation of what you changed",
  "files": {
    "/App.js": "complete file contents",
    "/styles.css": "complete file contents"
  }
}

IMPORTANT:
- Always return complete file contents.
- Never return markdown.
- Never wrap JSON in code fences.
- Keep React code valid.
- Use React and plain CSS.
- Do not invent missing project files.
- If the user asks to create a website, actually create the website code.
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { prompt, files = {} } = req.body || {};

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        error: "Please enter a website request."
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is missing in Vercel."
      });
    }

    const model =
      process.env.OPENROUTER_MODEL || "openrouter/free";

    const userMessage = `
USER REQUEST:
${prompt}

CURRENT PROJECT FILES:
${JSON.stringify(files, null, 2)}
`;

    const controller = new AbortController();

    // Stop waiting forever if OpenRouter gets stuck.
    const timeout = setTimeout(() => {
      controller.abort();
    }, 45000);

    let response;

    try {
      response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer":
              process.env.SITE_URL ||
              "https://nexusai-web-developer.vercel.app",
            "X-Title": "Nexus AI Web Developer"
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: SYSTEM_PROMPT
              },
              {
                role: "user",
                content: userMessage
              }
            ],
            temperature: 0.2,
            max_tokens: 12000
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter error:", data);

      return res.status(502).json({
        error:
          data?.error?.message ||
          "OpenRouter could not generate a response.",
        details: data?.error || null
      });
    }

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({
        error: "AI returned an empty response."
      });
    }

    let result;

    try {
      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      result = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("JSON parse error:", content);

      return res.status(502).json({
        error: "AI returned an invalid website response.",
        raw: content.slice(0, 1000)
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error("Nexus AI error:", error);

    if (error?.name === "AbortError") {
      return res.status(504).json({
        error:
          "AI response took too long. Please try again."
      });
    }

    return res.status(500).json({
      error:
        error?.message ||
        "Something went wrong while generating the website."
    });
  }
  }
