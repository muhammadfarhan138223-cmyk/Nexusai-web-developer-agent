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

// Order matters: first working provider is used.
// Gemini first because it can output the most tokens (long multi-page sites).
function getProviders() {
  const orModels = (process.env.OPENROUTER_MODEL || "qwen/qwen3-coder:free")
    .split(",").map((m) => m.trim()).filter(Boolean);
  return [
    {
      name: "gemini",
      key: process.env.GEMINI_API_KEY,
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      maxTokens: 32000
    },
    {
      name: "openrouter",
      key: process.env.OPENROUTER_API_KEY,
      url: "https://openrouter.ai/api/v1/chat/completions",
      model: orModels[0],
      models: orModels,
      maxTokens: 16000,
      headers: {
        "HTTP-Referer": process.env.SITE_URL || "https://buildora.vercel.app",
        "X-Title": "Buildora"
      }
    },
    {
      name: "groq",
      key: process.env.GROQ_API_KEY,
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      maxTokens: 8000
    }
  ].filter((p) => p.key);
}

// One streaming call. Writes text to `res` as it arrives.
// Returns { ok:false, message } if the provider failed before any output.
async function streamOnce(p, messages, res, signal, state) {
  const upstream = await fetch(p.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.key}`,
      "Content-Type": "application/json",
      ...(p.headers || {})
    },
    body: JSON.stringify({
      model: p.model,
      ...(p.models && p.models.length > 1 ? { models: p.models } : {}),
      messages,
      temperature: 0.2,
      max_tokens: p.maxTokens,
      stream: true
    }),
    signal
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    let message = `${p.name} failed (${upstream.status}).`;
    try {
      const j = JSON.parse(errText);
      message = j?.error?.message || j?.[0]?.error?.message || message;
    } catch {}
    return { ok: false, message };
  }

  if (!state.started) {
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    state.started = true;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finish = "";

  for await (const chunk of upstream.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let json;
      try { json = JSON.parse(payload); } catch { continue; }

      if (json.error) {
        return { ok: true, text, finish: "error", message: json.error.message };
      }
      const choice = json.choices?.[0];
      const piece = choice?.delta?.content;
      if (piece) {
        text += piece;
        res.write(piece);
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
    }
  }
  return { ok: true, text, finish };
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

  const providers = getProviders();
  if (providers.length === 0) {
    return res.status(500).json({
      error: "No API key found. Add GEMINI_API_KEY, OPENROUTER_API_KEY or GROQ_API_KEY in Vercel."
    });
  }

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
  const state = { started: false };

  const baseMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationMessages,
    { role: "user", content: userMessage }
  ];

  try {
    // 1) Try providers in order until one starts answering.
    let used = null;
    let full = "";
    let lastError = "";
    let finish = "";

    for (const p of providers) {
      try {
        const r = await streamOnce(p, baseMessages, res, controller.signal, state);
        if (!r.ok) { lastError = r.message; continue; }
        used = p; full = r.text; finish = r.finish;
        if (finish === "error" && !full) { lastError = r.message; used = null; continue; }
        break;
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        lastError = e?.message || lastError;
      }
    }

    if (!used) {
      clearTimeout(timeout);
      return res.status(502).json({ error: lastError || "All AI providers failed." });
    }

    // 2) If the model got cut off (no <<<END>>>), ask it to continue. Up to 3 times.
    for (let round = 0; round < 3 && !full.includes("<<<END>>>"); round++) {
      const r = await streamOnce(
        used,
        [
          ...baseMessages,
          { role: "assistant", content: full },
          {
            role: "user",
            content:
              "Your reply was cut off. Continue EXACTLY from the last character. " +
              "Do not repeat anything, do not restart the current file, do not add commentary. " +
              "Finish the current file, then any remaining files, then DEPS, SUGGESTIONS and <<<END>>>."
          }
        ],
        res, controller.signal, state
      );
      if (!r.ok || !r.text) break;
      full += r.text;
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
    return res.status(error?.name === "AbortError" ? 504 : 500).json({ error: message });
  }
}
