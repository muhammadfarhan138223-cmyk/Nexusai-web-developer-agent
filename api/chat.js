/* ------------------------------------------------------------------ */
/* MODELS - yahan sirf model ke naam badalne hain. Keys Vercel env se. */
/* ------------------------------------------------------------------ */
// Two chains: BIG for multipage/professional requests (smarter, slower coder
// models first), SMALL for quick edits/small pages (faster models first).
// Order = priority. If a provider fails OR returns unusable output, the next
// one in the list is tried automatically.
const PROVIDER_DEFS = {
  qwen: {
    name: "qwen",
    keyEnv: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1/chat/completions",
    models: ["qwen/qwen3-coder:free"],
    maxTokens: 30000
  },
  deepseek: {
    name: "deepseek",
    keyEnv: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1/chat/completions",
    models: ["deepseek/deepseek-chat-v3.1:free"],
    maxTokens: 30000
  },
  glm: {
    name: "glm",
    keyEnv: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1/chat/completions",
    models: ["z-ai/glm-5.2:free"],
    maxTokens: 30000
  },
  gemini: {
    name: "gemini",
    keyEnv: "GEMINI_API_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    models: ["gemini-2.5-flash"],
    maxTokens: 32000
  },
  groq: {
    name: "groq",
    keyEnv: "GROQ_API_KEY",
    url: "https://api.groq.com/openai/v1/chat/completions",
    models: ["openai/gpt-oss-120b"],
    maxTokens: 8000
  }
};

// Big/professional/multipage request -> smart coder models first.
const CHAIN_BIG = ["qwen", "deepseek", "glm", "gemini", "groq"];
// Small edit or simple page -> fastest models first.
const CHAIN_SMALL = ["glm", "gemini", "qwen", "groq"];

const BIG_KEYWORDS =
  /multi[- ]?page|multipage|professional|premium|full website|complete website|saas|landing page|e-?commerce|dashboard|admin panel|blog|portfolio site|business website/i;

// Detects both the auto "Fix with AI" message and a user typing about an error.
const FIX_KEYWORDS =
  /live preview shows this error|corrected complete file|fix (it|this)|error:|is invalid|could not find|is not defined|unexpected token/i;

function pickChain(prompt, isNewBuild) {
  if (FIX_KEYWORDS.test(prompt)) {
    // Fixing broken code needs the strongest reasoning model first.
    return CHAIN_BIG.map((n) => PROVIDER_DEFS[n]);
  }
  const names = isNewBuild && BIG_KEYWORDS.test(prompt) ? CHAIN_BIG : CHAIN_SMALL;
  return names.map((n) => PROVIDER_DEFS[n]);
}

/* ------------------------------------------------------------------ */
/* Missing-import auto-repair                                          */
/* ------------------------------------------------------------------ */

const MINI_FILE_RE = /<<<FILE ([^>\n]+)>>>/g;
const IMPORT_RE = /from\s+["'](\.[^"']+)["']/g;

function resolvePath(fromFile, importPath) {
  const fromDir = fromFile.split("/").slice(0, -1);
  const parts = importPath.split("/");
  const stack = [...fromDir];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return "/" + stack.filter(Boolean).join("/");
}

// Returns the list of imported local files that don't exist anywhere
// (not in the existing project, not in this reply's new files).
function findMissingImports(existingPaths, replyText) {
  const newPaths = new Set(existingPaths);
  let m;
  MINI_FILE_RE.lastIndex = 0;
  while ((m = MINI_FILE_RE.exec(replyText))) newPaths.add(m[1].trim());

  const missing = new Set();
  const fileBlocks = [
    ...replyText.matchAll(
      /<<<FILE ([^>\n]+)>>>\n([\s\S]*?)(?=<<<(?:FILE|DELETE|DEPS|SUGGESTIONS|END)|$)/g
    )
  ];

  for (const [, path, body] of fileBlocks) {
    const from = path.trim();
    let im;
    IMPORT_RE.lastIndex = 0;
    while ((im = IMPORT_RE.exec(body))) {
      const resolved = resolvePath(from, im[1]);
      const candidates = [
        resolved,
        resolved + ".js",
        resolved + ".jsx",
        resolved + "/index.js"
      ];
      if (!candidates.some((c) => newPaths.has(c))) {
        missing.add(resolved + " (imported from " + from + ")");
      }
    }
  }
  return [...missing];
}

// Design plan wala chhota step in models se hota hai (fast + sasta)
const PLANNER_CHAIN = ["gemini", "groq", "qwen"];

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */
const PLANNER_PROMPT = `
You are a senior product designer at a top design studio. Given a website request, write a SHORT design brief (max 220 words, plain text, no markdown) that a developer will follow.

Include:
1. Brand: invented brand name, one-line positioning, tone of voice.
2. Style direction: pick ONE distinctive direction (e.g. dark glassmorphism with neon accent, warm editorial minimal, bold neo-brutalist, soft gradient aurora, luxury black and gold). Do not default to generic blue-purple.
3. Palette: 5 hex colors (background, surface, text, muted text, accent) plus 1 secondary accent.
4. Fonts: one display font and one body font from Google Fonts (e.g. Space Grotesk + Inter, Playfair Display + DM Sans, Sora + Manrope).
5. Pages: list of pages and the sections on each page, in order.
6. Signature details: 3 specific things that make it feel premium (e.g. animated gradient mesh hero, bento grid features, marquee logo strip, floating cards with glow, sticky glass navbar, gradient text on key words).
`;

const SYSTEM_PROMPT = `
You are Buildora, a world-class front-end engineer AND visual designer. You build complete, production-quality React websites that look like they were made by a top design agency (think Linear, Stripe, Vercel, Framer, Lovable). Never produce a generic template look.

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
- Components in /components/, pages in /pages/, data in /data/, helpers in /utils/. Paths start with "/" and end in .js, .jsx, .css or .json.
- Multi-page: use React state in /App.js to switch pages (scroll to top on change). Do not use a router library.
- Keep every file under about 250 lines. Split big pages into section components. All files must be COMPLETE. Never stop half way.
- Every file must have balanced brackets and valid JSX. Every imported component must exist and be exported.
- If a data file holds icons, store icon NAMES as strings and map them to imported components in one place, or import the icon components directly. Never leave an icon undefined.
- Only use lucide-react icons that surely exist (Menu, X, ArrowRight, Check, Star, Zap, Shield, Globe, Layers, Sparkles, Code, Rocket, Users, BarChart3, Mail, Phone, MapPin, Clock, Heart, Play, ChevronDown, Quote, Lock, Cpu, Palette, Search). For brand logos (GitHub, Twitter/X, LinkedIn, Instagram, Facebook, YouTube) use small inline SVG, not lucide.
- Preserve existing design and functionality unless asked to change it.

DESIGN RULES (this is what makes it premium):
- Fonts: import 2 Google Fonts with @import at the very top of /styles.css. Big display headings (clamp(2.6rem, 6vw, 5rem)), tight letter-spacing (-0.02em), line-height 1.05 for headings, 1.6 for body.
- Use CSS variables for the palette. Follow the design brief if given. Avoid default blue/purple gradients unless the brief says so.
- Spacing: sections have 96-140px vertical padding on desktop, max-width 1200px container, generous whitespace. Consistent 8px scale.
- Hero: strong headline with one highlighted phrase (gradient text), sub-headline, two buttons, and a rich visual (product mockup built with divs, floating cards, glowing gradient orbs, or a large image). Never just centered text on a flat background.
- Depth: soft shadows, 1px subtle borders (rgba white 0.08 on dark), glassmorphism (backdrop-filter: blur) for navbar and cards, radial-gradient glows behind key elements.
- Cards: 16-24px radius, hover lift (translateY(-4px)) and border-color glow transition.
- Buttons: pill or 12px radius, gradient or solid accent, hover scale and glow, focus-visible outline.
- Animations: fade-up on scroll using IntersectionObserver in a small reusable Reveal component, plus CSS keyframes for floating, gradient shift and marquee. Respect prefers-reduced-motion.
- Layout variety: use bento grids, alternating image/text rows, stats bar, logo marquee, testimonial cards with avatars, pricing with a highlighted "popular" plan and monthly/yearly toggle, FAQ accordion, big CTA banner, rich footer.
- Navbar: sticky, glass effect, logo, links, CTA button, working mobile hamburger menu that opens a full panel and closes on link click. Menu items must never overlap page content (use position fixed with solid/blurred background and high z-index).
- Fully responsive: mobile first, test mentally at 375px, 768px and 1200px. No horizontal scroll. Grids collapse to 1 column on mobile.
- Content: real, specific, believable copy with numbers and benefits. No lorem ipsum. Realistic names, prices, metrics.
- Images: use https://picsum.photos/seed/KEYWORD/1200/800 for photos (change KEYWORD per image so each is different) and https://i.pravatar.cc/150?img=N (N from 1 to 60) for avatars. Always give images width/height or aspect-ratio, object-fit cover, rounded corners, and a gradient background on the wrapper as fallback. Also use inline SVG, emoji and gradients for illustrations.
- Accessibility: semantic tags (header, nav, main, section, footer), alt text, sufficient contrast, buttons are real buttons.
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

function activeChain(names) {
  const seen = new Set();
  const unique = names.filter((n) => (seen.has(n) ? false : seen.add(n)));
  return unique
    .map((n) => PROVIDER_DEFS[n])
    .map((p) => ({ ...p, key: process.env[p.keyEnv] }))
    .filter((p) => p.key);
}

function requestBody(p, messages, stream, maxTokens) {
  return JSON.stringify({
    model: p.models[0],
    messages,
    temperature: 0.4,
    max_tokens: maxTokens || p.maxTokens,
    stream
  });
}

function headersFor(p) {
  return {
    Authorization: `Bearer ${p.key}`,
    "Content-Type": "application/json",
    ...(p.url.includes("openrouter.ai")
      ? {
          "HTTP-Referer": process.env.SITE_URL || "https://buildora.vercel.app",
          "X-Title": "Buildora"
        }
      : {})
  };
}

// Step 1: short design brief (non-streaming). Returns "" if anything fails.
async function makePlan(providers, prompt) {
  const ordered = PLANNER_CHAIN.map((n) =>
    providers.find((p) => p.name === n)
  ).filter(Boolean);

  for (const p of ordered) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 40000);
    try {
      const r = await fetch(p.url, {
        method: "POST",
        headers: headersFor(p),
        body: requestBody(
          p,
          [
            { role: "system", content: PLANNER_PROMPT },
            { role: "user", content: prompt }
          ],
          false,
          1500
        ),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!r.ok) continue;
      const j = await r.json();
      const text = j?.choices?.[0]?.message?.content;
      if (text && text.length > 80) return text.trim();
    } catch {
      clearTimeout(t);
    }
  }
  return "";
}

// Step 2: streaming code generation
async function streamOnce(p, messages, res, signal, state) {
  const upstream = await fetch(p.url, {
    method: "POST",
    headers: headersFor(p),
    body: requestBody(p, messages, true),
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
    res.setHeader("X-Model-Provider", p.name);
    res.setHeader("X-Model-Name", p.models[0]);
    state.started = true;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finish = "";
  let usedModel = "";

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
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }

      if (json.model && !usedModel) usedModel = json.model;

      if (json.error) {
        return {
          ok: true,
          text,
          finish: "error",
          message: json.error.message,
          usedModel
        };
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
  return { ok: true, text, finish, usedModel };
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

  const anyProviders = activeChain(CHAIN_SMALL.concat(CHAIN_BIG));
  if (anyProviders.length === 0) {
    return res.status(500).json({
      error:
        "No API key found. Add OPENROUTER_API_KEY, GEMINI_API_KEY or GROQ_API_KEY in Vercel."
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

  const conversationMessages = history
    .filter(
      (m) =>
        m &&
        typeof m.text === "string" &&
        (m.role === "user" || m.role === "assistant")
    )
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.text.slice(0, 1500) }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 285000);
  const state = { started: false };

  try {
    // New site (few files) -> make a design brief first. Small edits skip this.
    const isNewBuild = Object.keys(files).length < 4;
    const providers = activeChain(
      pickChain(prompt, isNewBuild).map((p) => p.name)
    );
    const plan = isNewBuild ? await makePlan(providers, prompt) : "";

    const userMessage = `USER REQUEST:
${prompt}
${plan ? `\nDESIGN BRIEF (follow this closely):\n${plan}\n` : ""}
CURRENT PROJECT FILES:
${filesText || "(none)"}

INSTALLED PACKAGES:
${Object.keys(dependencies).join(", ") || "(none)"}

Reply ONLY in the required tag format and end with <<<END>>>.`;

    const baseMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationMessages,
      { role: "user", content: userMessage }
    ];

    let used = null;
    let full = "";
    const errors = [];

    for (const p of providers) {
      try {
        const r = await streamOnce(p, baseMessages, res, controller.signal, state);
        if (!r.ok) {
          errors.push(`${p.name}: ${r.message}`);
          continue;
        }
        if (r.finish === "error" && !r.text) {
          errors.push(`${p.name}: ${r.message}`);
          continue;
        }
        if (!r.text.includes("<<<FILE")) {
          // Model replied but gave no usable files — try the next provider
          // instead of showing "AI did not return any files" to the user.
          errors.push(`${p.name}: no files in response`);
          continue;
        }
        used = p;
        full = r.text;
        console.log(
          `[Buildora] provider=${p.name} model=${r.usedModel || p.models[0]} plan=${plan ? "yes" : "no"}`
        );
        break;
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        errors.push(`${p.name}: ${e?.message || "request failed"}`);
      }
    }

    if (!used) {
      clearTimeout(timeout);
      console.error("[Buildora] all providers failed:", errors);
      return res.status(502).json({
        error:
          "All AI models are busy or rate-limited right now. Please wait a few seconds and try again."
      });
    }

    // Cut off? Ask the same model to continue (up to 3 times).
    for (let round = 0; round < 3 && !full.includes("<<<END>>>"); round++) {
      const r = await streamOnce(
        used,
        [
          ...baseMessages,
          { role: "assistant", content: full },
          {
            role: "user",
            content:
              "Your reply was cut off. Continue EXACTLY from the last character. Do not repeat anything, do not restart the current file, no commentary. Finish the current file, then remaining files, then DEPS, SUGGESTIONS and <<<END>>>."
          }
        ],
        res,
        controller.signal,
        state
      );
      if (!r.ok || !r.text) break;
      full += r.text;
    }

    // Auto-repair: if the model referenced a component it never wrote,
    // ask it (once) to add exactly the missing file(s), instead of the
    // preview breaking with "Could not find module".
    const existingPaths = Object.keys(files).filter(isSafePath);
    const missing = findMissingImports(existingPaths, full);
    if (missing.length > 0) {
      console.log("[Buildora] missing imports, repairing:", missing);
      const r = await streamOnce(
        used,
        [
          ...baseMessages,
          { role: "assistant", content: full },
          {
            role: "user",
            content:
              "Your reply is missing file(s) that are imported but never written, which breaks the preview:\n" +
              missing.join("\n") +
              "\n\nReturn ONLY the COMPLETE missing file(s) using <<<FILE path>>>, nothing else, then <<<END>>>. Do not repeat files you already sent."
          }
        ],
        res,
        controller.signal,
        state
      );
      if (r.ok && r.text) full += r.text;
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
      res.write(`\n<<<e>>>${message}`);
      return res.end();
    }
    return res
      .status(error?.name === "AbortError" ? 504 : 500)
      .json({ error: message });
  }
}
