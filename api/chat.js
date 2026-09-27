const SYSTEM_PROMPT = `
You are Nexus AI Web Developer.

You are an expert frontend engineer.

Your job is to modify a React website based on the user's request.

Return ONLY valid JSON.

The JSON must have this exact structure:

{
  "message": "short explanation of what you changed",
  "files": {
    "/App.js": "complete file contents",
    "/styles.css": "complete file contents"
  }
}

Rules:

1. Always return complete file contents.
2. Never return markdown.
3. Never use code fences.
4. Never return explanations outside JSON.
5. The website must look professionally designed.
6. Use modern responsive CSS.
7. Do not use external image URLs unless the user explicitly asks.
8. Do not use external libraries inside App.js.
9. Use React only.
10. Keep the project compatible with Sandpack React.
11. If the user asks to improve the existing website, preserve useful existing functionality.
12. Make visual decisions like a professional product designer.
13. Avoid generic AI-looking gradients, excessive glassmorphism, random icons and unnecessary animations.
14. Prefer strong typography, spacing, hierarchy and polished responsive layouts.
15. Use semantic HTML.
16. Accessibility matters.
17. Never remove existing functionality unless the user asks.
18. Return both /App.js and /styles.css every time.
`;

function extractJson(text) {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    cleaned = cleaned.slice(
      firstBrace,
      lastBrace + 1
    );
  }

  return JSON.parse(cleaned);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({
        error:
          "OPENROUTER_API_KEY is not configured."
      });
    }

    const body = req.body || {};

    const prompt = String(body.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required."
      });
    }

    const existingFiles =
      body.files || {};

    const model =
      process.env.OPENROUTER_MODEL ||
      "nex-agi/nex-n2.5-pro:free";

    const fileContext = Object.entries(
      existingFiles
    )
      .map(([path, value]) => {
        const code =
          typeof value === "string"
            ? value
            : value?.code || "";

        return `
FILE: ${path}

${code}
`;
      })
      .join("\n");

    const userMessage = `
USER REQUEST:

${prompt}

CURRENT PROJECT:

${fileContext}

Now modify the project according to the user's request.

Return ONLY valid JSON.
`;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${process.env.OPENROUTER_API_KEY}`,

          "Content-Type":
            "application/json",

          "HTTP-Referer":
            "https://nexusai-web-developer.vercel.app",

          "X-Title":
            "Nexus AI Web Developer"
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

          temperature: 0.25,

          max_tokens: 12000
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errorMessage =
        data?.error?.message ||
        "OpenRouter request failed.";

      return res.status(response.status).json({
        error: errorMessage
      });
    }

    const content =
      data?.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(500).json({
        error:
          "The AI returned an empty response."
      });
    }

    let result;

    try {
      result = extractJson(content);
    } catch {
      return res.status(500).json({
        error:
          "The AI response was not valid JSON. Try the request again."
      });
    }

    if (
      !result.files ||
      typeof result.files !== "object"
    ) {
      return res.status(500).json({
        error:
          "The AI did not return valid project files."
      });
    }

    return res.status(200).json({
      message:
        result.message ||
        "Project updated successfully.",

      files: result.files
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error:
        error?.message ||
        "Unexpected server error."
    });
  }
}
