const SYSTEM_PROMPT = `
You are Buildora, an AI web developer that builds complete, professional React websites.

You receive a request, the current project files and the installed npm packages. Create or modify the project to fulfil the request.

OUTPUT FORMAT (strict). Plain text only. No JSON, no markdown, no code fences.

<<<MESSAGE>>>
2-4 short friendly sentences about what you built. Same language style as the user (English or Roman Urdu). No markdown.
<<<FILE /App.js>>>
COMPLETE content of the file
<<<FILE /components/Navbar.js>>>
COMPLETE content of the file
<<<DELETE /old/File.js>>>
<<<DEPS>>>
lucide-react
<<<SUGGESTIONS>>>
Add a pricing section
Switch to a light theme
Add a contact form
<<<END>>>

FORMAT RULES:
- Start with <<<MESSAGE>>> and finish with <<<END>>>. Always write <<<END>>> last.
- <<<FILE path>>> is followed by the full file content. Never write partial code or "rest of code".
- <<<DELETE path>>> has no body. Optional.
- <<<DEPS>>> lists only NEW npm packages, one per line. Optional.
- <<<SUGGESTIONS>>> has exactly 3 lines, each a command of max 8 words.
- Only return files that are new or changed.

PROJECT RULES:
- Runs in Sandpack React template. /App.js must exist with a default export. /styles.css is the global stylesheet.
- Components in /components/, data in /data/, helpers in /utils/. Paths start with "/" and end in .js, .jsx, .css or .json.
- Multi-page: use React state in /App.js to switch pages. Do not use a router library.
- Prefer plain React and CSS. Add a package only when clearly needed.
- If the request is very large (many pages), build a COMPACT version: all pages exist, but share components and data files, and keep every file under 120 lines. Never stop half way.
- Every file must have balanced brackets and valid JSX.
- Professional, modern, responsive design. Real believable content, no lorem ipsum.
- No external image URLs. Use gradients, emoji, inline SVG or icon libraries.
- Preserve existing design and functionality unless asked to change it.
`;

const ALLOWED_EXTENSIONS = [".js", ".jsx", ".css", ".json"];

function isSafePath(path) {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.includes("..") &&
    !path.includes("//") &&
    path.length <= 120 &&
    ALLOWED_EXTENSIONS.some((ext) => path.endsWith(ext))
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const prompt = body.prompt;
  const files = body.files || {};
  const dependencies = body.dependencies || {};
  const history = Array.isArray(body.history) ? body.history : [];

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Please enter a website request." });
  }

  if (prompt.length > 6000) {
    return res
      .status(400)
      .json({ error: "Your request is too long. Please shorten it." });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENROUTER_API_KEY is missing. Add it in Vercel Environment Variables."
    });
  }

  // OPENROUTER_MODEL can hold several models, comma separated.
  // If the first one is busy or rate-limited, OpenRouter tries the next.
  const models = (process.env.OPENROUTER_MODEL || "qwen/qwen3-coder:free")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const filesText = Object.entries(files)
    .filter(([p, c]) => isSafePath(p) && typeof c === "string")
    .map(([p, c]) => `=== ${p} ===\n${c}`)
    .join("\n\n");

  if (filesText.length > 150000) {
    return res.status(400).json({
      error: "Project is too big for one request. Reset or simplify it."
    });
  }

  const userMessage = `USER REQUEST:
${prompt}

CURRENT PROJECT FILES:
${filesText || "(none)"}

INSTALLED PACKAGES:
${Object.keys(dependencies).join(", ") || "(none)"}

Reply ONLY in the required tag format and end with <<<END>>>.`;

  const conversationMessages = history
    .filter(
      (m) =>
        m &&
        typeof m.text === "string" &&
        (m.role === "user" || m.role === "assistant")
    )
    .slice(-6)
    .map((m) => ({
      role: m.role,
      content: m.text.slice(0, 1500)
    }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 280000);

  try {
    const upstream = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.SITE_URL || "https://buildora.vercel.app",
          "X-Title": "Buildora"
        },
        body: JSON.stringify({
          model: models[0],
          ...(models.length > 1 ? { models } : {}),
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...conversationMessages,
            { role: "user", content: userMessage }
          ],
          temperature: 0.2,
          max_tokens: 16000,
          stream: true
        }),
        signal: controller.signal
      }
    );

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      let message = `AI request failed (${upstream.status}).`;
      try {
        message = JSON.parse(errText)?.error?.message || message;
      } catch {
        // keep default message
      }
      return res.status(502).json({ error: message });
    }

    // From here on we stream plain text to the browser.
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    const decoder = new TextDecoder();
    let buffer = "";
    let truncated = false;

    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }

        if (json.error) {
          res.write(
            `\n<<<ERROR>>>${json.error.message || "The AI model failed."}`
          );
          clearTimeout(timeout);
          return res.end();
        }

        const choice = json.choices?.[0];
        const text = choice?.delta?.content;
        if (text) res.write(text);
        if (choice?.finish_reason === "length") truncated = true;
      }
    }

    if (truncated) {
      res.write(
        "\n<<<ERROR>>>The AI ran out of space before finishing. Ask for fewer pages at a time."
      );
    }

    clearTimeout(timeout);
    return res.end();
  } catch (error) {
    clearTimeout(timeout);
    console.error("Buildora backend error:", error);

    const message =
      error?.name === "AbortError"
        ? "The AI took too long. Try a smaller request."
        : error?.message || "Buildora could not generate the website.";

    if (res.headersSent) {
      res.write(`\n<<<ERROR>>>${message}`);
      return res.end();
    }

    return res.status(error?.name === "AbortError" ? 504 : 500).json({
      error: message
    });
  }
      }
