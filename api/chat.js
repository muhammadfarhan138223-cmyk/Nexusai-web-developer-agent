const SYSTEM_PROMPT = `
You are Nexus AI Web Developer.

You are an AI coding agent that creates and edits websites.

The user sends:
1. A website request.
2. The current project files.

Your job is to generate the requested website or modify the existing website.

RETURN ONLY VALID JSON.

Required format:

{
  "message": "Short explanation of what you changed.",
  "files": {
    "/App.js": "COMPLETE FILE CONTENT",
    "/styles.css": "COMPLETE FILE CONTENT"
  }
}

STRICT RULES:

- Return JSON only.
- Never use markdown.
- Never use code fences.
- Never put explanations outside JSON.
- Always provide complete /App.js content.
- Always provide complete /styles.css content.
- Use React.
- Use plain CSS.
- Keep the code valid and runnable in Sandpack.
- Do not use external files that do not exist.
- Do not leave TODO placeholders.
- Actually build the website requested by the user.
- Make the design professional, modern and responsive.
- Preserve existing functionality unless the user asks to change it.
`;

export default async function handler(req, res) {
  // Only POST is allowed
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};

    const prompt = body.prompt;
    const files = body.files || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        error: "Please enter a website request."
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error:
          "OPENROUTER_API_KEY is missing. Add it in Vercel Environment Variables."
      });
    }

    /*
     * openrouter/free automatically chooses
     * an available free model.
     */
    const model =
      process.env.OPENROUTER_MODEL || "openrouter/free";

    const userMessage = `
USER REQUEST:
${prompt}

CURRENT PROJECT FILES:
${JSON.stringify(files, null, 2)}

Remember:
Return ONLY the required JSON object.
`;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 40000);

    let response;

    try {
      response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${apiKey}`,
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

            temperature: 0.1,

            max_tokens: 12000
          }),

          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    /*
     * Read response safely.
     */
    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        error:
          "OpenRouter returned an invalid response.",
        raw: rawText.slice(0, 500)
      });
    }

    /*
     * OpenRouter/API error.
     */
    if (!response.ok) {
      console.error("OpenRouter error:", data);

      return res.status(502).json({
        error:
          data?.error?.message ||
          data?.message ||
          `OpenRouter request failed (${response.status}).`
      });
    }

    /*
     * Get AI text.
     */
    const content =
      data?.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({
        error: "AI returned an empty response."
      });
    }

    /*
     * Clean possible markdown fences.
     */
    let cleaned = content.trim();

    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    /*
     * Parse AI JSON.
     */
    let result;

    try {
      result = JSON.parse(cleaned);
    } catch (error) {
      console.error(
        "AI JSON parse failed:",
        cleaned
      );

      return res.status(502).json({
        error:
          "AI generated invalid website data. Please try again."
      });
    }

    /*
     * Validate required structure.
     */
    if (
      !result ||
      typeof result !== "object" ||
      !result.files ||
      typeof result.files !== "object"
    ) {
      return res.status(502).json({
        error:
          "AI response did not contain valid website files."
      });
    }

    /*
     * Make sure App.js exists.
     */
    if (
      typeof result.files["/App.js"] !== "string"
    ) {
      return res.status(502).json({
        error:
          "AI response is missing /App.js."
      });
    }

    /*
     * Make sure styles.css exists.
     */
    if (
      typeof result.files["/styles.css"] !== "string"
    ) {
      return res.status(502).json({
        error:
          "AI response is missing /styles.css."
      });
    }

    /*
     * Return clean response to frontend.
     */
    return res.status(200).json({
      message:
        typeof result.message === "string"
          ? result.message
          : "Website generated successfully.",

      files: {
        "/App.js": result.files["/App.js"],
        "/styles.css": result.files["/styles.css"]
      }
    });

  } catch (error) {
    console.error(
      "Nexus AI backend error:",
      error
    );

    if (error?.name === "AbortError") {
      return res.status(504).json({
        error:
          "AI took too long to respond. Please try again."
      });
    }

    return res.status(500).json({
      error:
        error?.message ||
        "Nexus AI could not generate the website."
    });
  }
}
