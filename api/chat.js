/* ------------------------------------------------------------------ */
/* Provider + model chains                                             */
/* ------------------------------------------------------------------ */

// Each provider tries its models in order. If a model fails, is
// rate-limited, or returns nothing usable, the next model is tried
// automatically — all within the same provider — before moving on
// to the next provider in the chain.
const PROVIDER_DEFS = {
  openrouter: {
    name: "openrouter",
    keyEnv: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1/chat/completions",
    // 12 specific free models instead of the "openrouter/free" auto
    // router — the auto router picks an unpredictable model with an
    // unknown output limit, which was causing "reply cut off" errors.
    // These are all currently free (":free" suffix) and known-decent
    // at code generation. Order = priority.
    models: [
      "qwen/qwen3-coder:free",
      "deepseek/deepseek-chat-v3.1:free",
      "deepseek/deepseek-r1:free",
      "z-ai/glm-4.5-air:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "nvidia/nemotron-nano-9b-v2:free",
      "qwen/qwen3-235b-a22b:free",
      "moonshotai/kimi-k2:free",
      "mistralai/mistral-small-3.2-24b-instruct:free",
      "google/gemma-3-27b-it:free",
      "meta-llama/llama-4-maverick:free",
      "meta-llama/llama-4-scout:free"
    ],
    maxTokens: 30000
  },

  gemini: {
    name: "gemini",
    keyEnv: "GEMINI_API_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    maxTokens: 32000
  },

  groq: {
    name: "groq",
    keyEnv: "GROQ_API_KEY",
    url: "https://api.groq.com/openai/v1/chat/completions",
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
    maxTokens: 8000
  }
};

// Big/professional/multipage request -> OpenRouter first,
// then Gemini model fallback chain, then Groq model fallback chain.
const CHAIN_BIG = ["openrouter", "gemini", "groq"];

// Small edit or simple page -> same provider priority,
// with automatic model fallback inside each provider.
const CHAIN_SMALL = ["openrouter", "gemini", "groq"];

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
  const names =
    isNewBuild && BIG_KEYWORDS.test(prompt) ? CHAIN_BIG : CHAIN_SMALL;
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

// Catches the other very common crash: a file is imported correctly
// (the path exists) but the thing being imported was never actually
// exported as default — React then renders "undefined" and crashes
// with "Element type is invalid".
function buildFileMap(existingFiles, replyText) {
  const map = new Map(Object.entries(existingFiles));
  const fileBlocks = [
    ...replyText.matchAll(
      /<<<FILE ([^>\n]+)>>>\n([\s\S]*?)(?=<<<(?:FILE|DELETE|DEPS|SUGGESTIONS|END)|$)/g
    )
  ];
  for (const [, path, body] of fileBlocks) map.set(path.trim(), body);
  return map;
}

const DEFAULT_IMPORT_RE =
  /import\s+([A-Za-z_$][\w$]*)\s+from\s+["'](\.[^"']+)["']/g;

function findExportMismatches(fileMap, replyText) {
  const issues = [];
  const fileBlocks = [
    ...replyText.matchAll(
      /<<<FILE ([^>\n]+)>>>\n([\s\S]*?)(?=<<<(?:FILE|DELETE|DEPS|SUGGESTIONS|END)|$)/g
    )
  ];

  for (const [, path, body] of fileBlocks) {
    const from = path.trim();
    let im;
    DEFAULT_IMPORT_RE.lastIndex = 0;
    while ((im = DEFAULT_IMPORT_RE.exec(body))) {
      const compName = im[1];
      const resolved = resolvePath(from, im[2]);
      const candidates = [
        resolved,
        resolved + ".js",
        resolved + ".jsx",
        resolved + "/index.js"
      ];
      const targetPath = candidates.find((c) => fileMap.has(c));
      if (!targetPath) continue; // already caught by findMissingImports
      const targetCode = fileMap.get(targetPath) || "";
      if (!/export\s+default/.test(targetCode)) {
        issues.push(
          `${from}: imports "${compName}" as a default export from ${targetPath}, but that file has no "export default" — this causes "Element type is invalid"`
        );
      }
    }
  }
  return issues;
}

// Design plan wala chhota step in models se hota hai (fast + sasta)
const PLANNER_CHAIN = ["gemini", "groq", "openrouter"];

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

OR, only when the request is genuinely too ambiguous to build safely (rare):
<<<QUESTION>>>
One short, specific question. No files, no code.
<<<END>>>

FORMAT RULES:
- Start with <<<MESSAGE>>> and finish with <<<END>>>. Always write <<<END>>> last.
- <<<FILE path>>> is followed by the full file content. Never write partial code or "rest of code".
- <<<DELETE path>>> has no body. Optional.
- <<<DEPS>>> lists only NEW npm packages, one per line. Optional.
- <<<SUGGESTIONS>>> has exactly 3 lines, each a command of max 8 words.
- Only return files that are new or changed.
- Use <<<QUESTION>>> ONLY when you truly cannot proceed (e.g. "build my business website" with zero detail on what the business does). For almost every request, make reasonable assumptions and build something real instead of asking — do not overuse this.
- IMPORTANT: if the request implies MANY pages/files, keep each file SHORT and simple rather than risking a cut-off reply. A working simple site beats a half-finished premium one.

PROJECT RULES:
- Runs in Sandpack React template. /App.js must exist with a default export. /styles.css is the global stylesheet.
- Components in /components/, pages in /pages/, data in /data/, helpers in /utils/. Paths start with "/" and end in .js, .jsx, .css or .json.
- Multi-page: use React state in /App.js to switch pages (scroll to top on change). Do not use a router library.
- Keep every file under about 200 lines. Split big pages into section components. All files must be COMPLETE. Never stop half way.
- Every file must have balanced brackets and valid JSX. Every imported component must exist and be exported.
- If a data file holds icons, store icon NAMES as strings and map them to imported components in one place, or import the icon components directly. Never leave an icon undefined.
- Only use lucide-react icons that surely exist (Menu, X, ArrowRight, Check, Star, Zap, Shield, Globe, Layers, Sparkles, Code, Rocket, Users, BarChart3, Mail, Phone, MapPin, Clock, Heart, Play, ChevronDown, Quote, Lock, Cpu, Palette, Search). For brand logos (GitHub, Twitter/X, LinkedIn, Instagram, Facebook, YouTube) use small inline SVG, not lucide.
- Preserve existing design and functionality unless asked to change it.

DEFAULT SCAFFOLDING (apply automatically, without being asked, unless the user clearly wants a single isolated section):
- Every site gets a real Navbar (with working links/routing between pages) and a real Footer (columns, copyright, relevant links), not just a hero section floating alone.
- For a business/SaaS/product/portfolio/agency site, always include, unless the user restricts scope: Home, an About or Features/Services page, a Contact page (with a working local form using React state, no real backend), and a Pricing page if it's a product/SaaS. Infer reasonable page names from the request.
- Give the document a real title: in /App.js use useEffect to set document.title to a specific brand + tagline (not "React App"). Add short, relevant alt text on every image.
- Every page must render correctly at 375px, 768px and 1200px widths — this is mandatory, not optional, and applies to every page you generate, not just the homepage.

BACKEND / LOGIN / DATABASE REQUESTS:
- This project has no real server; Sandpack only runs frontend React. If asked for login, signup, a database, or "backend":
  1. Prefer a clearly-labeled LOCAL simulation using React state + window.localStorage (mirrors real UX: forms, validation, a logged-in state) so the preview actually works end-to-end.
  2. In <<<MESSAGE>>>, briefly and honestly tell the user this is a local demo and that a real deployment needs a backend service such as Supabase or Firebase (both have free tiers), and that you can write that integration code if they share they want it and confirm they'll add their project keys.
  3. Only write real Supabase/Firebase client SDK code (using @supabase/supabase-js or firebase) if the user explicitly asks for real/production auth — add it to <<<DEPS>>> and clearly comment where their API keys go.

CATEGORY-AWARE DESIGN (do not reuse the same look for every request — pick the direction that fits what is being built):
- SaaS / product marketing site: dark or light glass UI, bento-grid features, pricing tiers, logo marquee — the "modern startup" look.
- AI / chatbot / assistant app: a real chat UI (message bubbles, input bar, sidebar for conversations), calmer neutral palette, rounded soft surfaces — not a marketing hero.
- Portfolio / personal / creative: editorial typography, large imagery, asymmetric layout, more whitespace, a personal tone.
- E-commerce / shop: product grid with cards (image, price, add-to-cart state), category filters, a cart summary — commerce UI patterns, not a SaaS hero.
- Restaurant / local business / blog / other real-world categories: match real-world expectations for that category (menu layout, article layout, service list) instead of defaulting to a generic tech gradient hero.
- Read the request for its actual category and let fonts, palette and layout patterns follow the category; only fall back to the general SaaS-style hero when the category is genuinely unclear.

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
IMPORTANT FOR SIMPLER MODELS: Prioritize a working, simple, correct result over
a feature-packed one. If you are unsure you can finish a complex design within
the file-size and token limits, build a simpler but fully working version
instead of an ambitious one that risks being cut off or broken.
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

// modelOverride is the ONLY addition here.
// It allows any provider to try its model list one by one.
function requestBody(p, messages, stream, maxTokens, modelOverride) {
  return JSON.stringify({
    model: modelOverride || p.models[0],
    messages,
    temperature: 0.4,
    max_tokens: maxTokens || p.maxTokens,
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {})
  });
}

function headersFor(p) {
  return {
    Authorization: `Bearer ${p.key}`,
    "Content-Type": "application/json",
    ...(p.url.includes("openrouter.ai")
      ? {
          "HTTP-Referer":
            process.env.SITE_URL || "https://buildora.vercel.app",
          "X-Title": "Buildora"
        }
      : {})
  };
}

// Per-attempt network timeout. Keeping this well below the overall
// 270s request budget means a single stuck model can't eat the whole
// budget and produce a generic "took too long" failure — it gets
// dropped and the next model/provider gets a real chance instead.
const ATTEMPT_TIMEOUT_MS = 75000;

// Step 1: short design brief (non-streaming). Returns "" if anything fails.
// Provider order is Gemini -> Groq -> OpenRouter.
// Each provider also tries its models in order.
async function makePlan(providers, prompt) {
  const ordered = PLANNER_CHAIN.map((n) =>
    providers.find((p) => p.name === n)
  ).filter(Boolean);

  for (const p of ordered) {
    for (const model of p.models) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);

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
            1500,
            model
          ),
          signal: ctrl.signal
        });

        clearTimeout(t);

        if (!r.ok) continue;

        const j = await r.json();
        const text = j?.choices?.[0]?.message?.content;

        if (text && text.length > 80) {
          return text.trim();
        }
      } catch {
        clearTimeout(t);
      }
    }
  }

  return "";
}

// Step 2: streaming code generation for ONE model attempt, with its
// own timeout so a single stuck/slow free model can't consume the
// entire request budget.
async function streamOnce(p, messages, res, signal, state, modelOverride) {
  const model = modelOverride || p.models[0];

  const attemptCtrl = new AbortController();
  const onAbort = () => attemptCtrl.abort();
  signal.addEventListener("abort", onAbort);

  const attemptTimeout = setTimeout(() => {
    attemptCtrl.abort();
  }, ATTEMPT_TIMEOUT_MS);

  let upstream;

  try {
    upstream = await fetch(p.url, {
      method: "POST",
      headers: headersFor(p),
      body: requestBody(p, messages, true, undefined, model),
      signal: attemptCtrl.signal
    });
  } catch (e) {
    clearTimeout(attemptTimeout);
    signal.removeEventListener("abort", onAbort);

    // If the OVERALL request was aborted (user hit Stop, or the 270s
    // budget ran out), propagate that up so we stop entirely.
    if (signal.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }

    // Otherwise this was just this one model timing out/failing —
    // treat it as a normal "try the next model" case, not a fatal error.
    return {
      ok: false,
      message: `${model} took too long to respond.`,
      attemptedModel: model
    };
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(attemptTimeout);
    signal.removeEventListener("abort", onAbort);

    const errText = await upstream.text().catch(() => "");
    let message = `${p.name} failed (${upstream.status}).`;

    try {
      const j = JSON.parse(errText);
      message = j?.error?.message || j?.[0]?.error?.message || message;
    } catch {}

    return { ok: false, message, attemptedModel: model };
  }

  if (!state.started) {
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Model-Provider", p.name);
    res.setHeader("X-Model-Name", model);
    state.started = true;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finish = "";
  let usedModel = "";
  let usage = null;

  try {
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

        if (json.model && !usedModel) {
          usedModel = json.model;
        }

        if (json.usage) {
          usage = json.usage;
        }

        if (json.error) {
          clearTimeout(attemptTimeout);
          signal.removeEventListener("abort", onAbort);
          return {
            ok: true,
            text,
            finish: "error",
            message: json.error.message,
            usedModel,
            usage,
            attemptedModel: model
          };
        }

        const choice = json.choices?.[0];
        const piece = choice?.delta?.content;

        if (piece) {
          text += piece;
          res.write(piece);
        }

        if (choice?.finish_reason) {
          finish = choice.finish_reason;
        }
      }
    }
  } catch (e) {
    clearTimeout(attemptTimeout);
    signal.removeEventListener("abort", onAbort);

    if (signal.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }

    // The stream dropped mid-way (this one model's connection died).
    // Whatever text we already streamed to the user stays on screen;
    // report this as a soft failure so the caller can pick up with a
    // continuation instead of a hard error.
    return {
      ok: true,
      text,
      finish: finish || "error",
      message: "connection interrupted",
      usedModel,
      usage,
      attemptedModel: model
    };
  }

  clearTimeout(attemptTimeout);
  signal.removeEventListener("abort", onAbort);

  return { ok: true, text, finish, usedModel, usage, attemptedModel: model };
}

// Tries all models inside the same provider before moving to
// the next provider.
//
// Example, OpenRouter:
//   1. qwen/qwen3-coder:free
//   2. deepseek/deepseek-chat-v3.1:free
//   3. ... (10 more)
//
// If a model is unavailable/rate-limited/too slow before producing
// output, the next model is attempted automatically.
async function streamWithModelFallback(p, messages, res, signal, state) {
  let lastError = "";

  for (const model of p.models) {
    status(res, state, 25, `Trying ${model}...`);

    try {
      const r = await streamOnce(p, messages, res, signal, state, model);

      // HTTP/rate-limit/timeout/provider failure before streaming:
      // safely try the next model.
      if (!r.ok) {
        lastError = r.message || `${model} failed.`;

        status(res, state, 25, `${model} unavailable, trying the next model...`);

        continue;
      }

      // Streaming error with no generated text:
      // safely try the next model.
      if (r.finish === "error" && !r.text) {
        lastError = r.message || `${model} returned an error.`;

        status(res, state, 25, `${model} is busy, trying the next model...`);

        continue;
      }

      // A model has actually generated output.
      // Keep it rather than restarting another model and duplicating
      // already-streamed content.
      return {
        ...r,
        selectedModel: r.usedModel || model
      };
    } catch (e) {
      if (e?.name === "AbortError") {
        throw e;
      }

      lastError = e?.message || `${model} request failed.`;

      status(res, state, 25, `${model} failed, trying the next model...`);
    }
  }

  return {
    ok: false,
    text: "",
    finish: "",
    message: lastError || `${p.name} models are unavailable right now.`
  };
}

/* ------------------------------------------------------------------ */
/* Live status + self-check                                            */
/* ------------------------------------------------------------------ */

// Writes a status marker the frontend shows live in the "working on it"
// panel. This is our honest substitute for "AI takes a screenshot" —
// it is a real progress narration + a real automated code check below,
// not a visual check (which needs a browser + vision model we don't run).
function status(res, state, pct, text) {
  if (!state.started) {
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    state.started = true;
  }

  res.write(`<<<STATUS ${pct}%|${text.replace(/[>\n]/g, " ")}>>>\n`);
}

// Cheap, free, zero-token static check: catches the two most common
// causes of a blank/broken preview — unbalanced brackets (a line
// accidentally dropped) and braces mismatched across a file.
function findBracketIssues(replyText) {
  const issues = [];

  const fileBlocks = [
    ...replyText.matchAll(
      /<<<FILE ([^>\n]+)>>>\n([\s\S]*?)(?=<<<(?:FILE|DELETE|DEPS|SUGGESTIONS|END)|$)/g
    )
  ];

  const pairs = [
    ["{", "}"],
    ["(", ")"],
    ["[", "]"]
  ];

  for (const [, path, body] of fileBlocks) {
    for (const [open, close] of pairs) {
      const opens = (body.match(new RegExp(`\\${open}`, "g")) || []).length;

      const closes = (body.match(new RegExp(`\\${close}`, "g")) || []).length;

      if (opens !== closes) {
        issues.push(
          `${path.trim()}: unbalanced "${open}${close}" (${opens} vs ${closes}) — likely a missing or extra character`
        );
      }
    }
  }

  return issues;
}

// CSS-specific check: catches "Unknown word" / broken CSS caused by an
// odd number of quotes (a string that never closed) inside a .css file
// — brackets alone don't catch this class of error.
function findCssIssues(replyText) {
  const issues = [];

  const fileBlocks = [
    ...replyText.matchAll(
      /<<<FILE ([^>\n]+\.css)>>>\n([\s\S]*?)(?=<<<(?:FILE|DELETE|DEPS|SUGGESTIONS|END)|$)/g
    )
  ];

  for (const [, path, body] of fileBlocks) {
    const singleQuotes = (body.match(/'/g) || []).length;
    const doubleQuotes = (body.match(/"/g) || []).length;

    if (singleQuotes % 2 !== 0) {
      issues.push(
        `${path.trim()}: an odd number of ' characters — a string was likely never closed, which breaks CSS parsing`
      );
    }

    if (doubleQuotes % 2 !== 0) {
      issues.push(
        `${path.trim()}: an odd number of " characters — a string was likely never closed, which breaks CSS parsing`
      );
    }
  }

  return issues;
}

// Only spend an extra fix-round on issues that WILL actually break the
// preview (missing files, unbalanced brackets). A single export-mismatch
// note is often a false positive on complex files, so it alone doesn't
// justify burning another model call and more rate-limit budget.
// Only spend an extra model call on issues that will DEFINITELY break
// the preview. This keeps small edits down to 1 model call instead of
// 2-3, which matters a lot on a shared free-tier rate limit.
function issuesWorthFixing(issues) {
  const serious = issues.filter(
    (i) =>
      i.includes('unbalanced') ||
      i.includes('never closed')
  );
  return serious;
}

/* ------------------------------------------------------------------ */
/* Main handler                                                        */
/* ------------------------------------------------------------------ */

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
    .map((m) => ({
      role: m.role,
      content: m.text.slice(0, 1500)
    }));

  // Overall request budget. Kept comfortably under Vercel's configured
  // maxDuration (300s in vercel.json) so we always have time to write a
  // clean response instead of the platform killing the function first.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 270000);

  const state = { started: false };

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let sawUsage = false;

  const addUsage = (u) => {
    if (!u) return;
    sawUsage = true;
    totalPromptTokens += u.prompt_tokens || 0;
    totalCompletionTokens += u.completion_tokens || 0;
  };

  try {
    status(res, state, 5, "Understanding your request...");

    // New site (few files) -> make a design brief first. Small edits skip this.
    const isNewBuild = Object.keys(files).length < 4;

    const providers = activeChain(
      pickChain(prompt, isNewBuild).map((p) => p.name)
    );

    if (isNewBuild) {
      status(res, state, 15, "Planning the design...");
    }

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
      status(res, state, 25, `Starting with ${p.name}...`);

      try {
        const r = await streamWithModelFallback(
          p,
          baseMessages,
          res,
          controller.signal,
          state
        );

        if (!r.ok) {
          errors.push(`${p.name}: ${r.message}`);

          status(
            res,
            state,
            25,
            `${p.name} is unavailable, trying the next provider...`
          );

          continue;
        }

        if (r.finish === "error" && !r.text) {
          errors.push(`${p.name}: ${r.message}`);

          status(res, state, 25, `${p.name} is busy, trying the next provider...`);

          continue;
        }

        if (!r.text.includes("<<<FILE") && !r.text.includes("<<<QUESTION")) {
          // Model replied but gave no usable files or question — try the
          // next provider instead of showing an empty result to the user.
          errors.push(`${p.name}: no files in response`);

          status(
            res,
            state,
            25,
            `${p.name} gave an unusable reply, trying the next provider...`
          );

          continue;
        }

        // Keep the provider, but remember EVERY model still left in its
        // list so a stuck continuation can hop to another model instead
        // of retrying the one that just proved it can't finish.
        const usedModelName = r.selectedModel || r.usedModel || p.models[0];
        const usedIndex = p.models.indexOf(usedModelName);

        used = {
          ...p,
          models:
            usedIndex >= 0
              ? [usedModelName, ...p.models.slice(usedIndex + 1)]
              : [usedModelName]
        };

        full = r.text;

        addUsage(r.usage);

        console.log(
          `[Buildora] provider=${p.name} model=${usedModelName} plan=${
            plan ? "yes" : "no"
          }`
        );

        break;
      } catch (e) {
        if (e?.name === "AbortError") {
          throw e;
        }

        errors.push(`${p.name}: ${e?.message || "request failed"}`);

        status(res, state, 25, `${p.name} failed, trying the next provider...`);
      }
    }

    if (!used) {
      clearTimeout(timeout);

      console.error("[Buildora] all providers failed:", errors);

      const msg =
        "All AI models are busy or rate-limited right now. Please wait a few seconds and try again.";

      if (res.headersSent) {
        res.write(`\n<<<e>>>${msg}`);
        return res.end();
      }

      return res.status(502).json({ error: msg });
    }

    // Cut off? Ask the same model to continue. If that model keeps
    // failing/timing out, hop to the NEXT model in the same provider's
    // list rather than repeatedly retrying one that already proved it
    // can't finish this response.
    const remainingModels = used.models.slice(1);
    let currentModel = used.models[0];
    let stuckRounds = 0;

    for (
      let round = 0;
      round < 5 && !full.includes("<<<END>>>");
      round++
    ) {
      status(res, state, 55, `Reply was long, continuing with ${currentModel}...`);

      let r;

      try {
        r = await streamOnce(
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
          state,
          currentModel
        );
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        r = { ok: false };
      }

      if (!r.ok || !r.text) {
        stuckRounds++;

        // This model can't continue — try a different one from the
        // same provider before giving up on continuing altogether.
        if (remainingModels.length > 0) {
          currentModel = remainingModels.shift();
          continue;
        }

        break;
      }

      full += r.text;
      addUsage(r.usage);
    }

    const isQuestion = full.includes("<<<QUESTION");

    if (!isQuestion) {
      status(res, state, 70, "Checking generated files for errors...");

      // Self-check pass #1: static analysis, costs zero tokens.
      const existingPaths = Object.keys(files).filter(isSafePath);

      let issues = [
        ...findMissingImports(existingPaths, full),
        ...findBracketIssues(full),
        ...findCssIssues(full),
        ...findExportMismatches(buildFileMap(files, full), full)
      ];

      if (issuesWorthFixing(issues).length > 0) {
        status(
          res,
          state,
          82,
          `Found ${issues.length} issue(s), fixing with ${currentModel}...`
        );

        let r;

        try {
          r = await streamOnce(
            used,
            [
              ...baseMessages,
              { role: "assistant", content: full },
              {
                role: "user",
                content:
                  "Your reply has these problems, which will break the live preview:\n" +
                  issues.join("\n") +
                  "\n\nReturn ONLY the COMPLETE corrected file(s) using <<<FILE path>>>, nothing else, then <<<END>>>. Do not repeat files that are already correct."
              }
            ],
            res,
            controller.signal,
            state,
            currentModel
          );
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          r = { ok: false };
        }

        if (r.ok && r.text) {
          full += r.text;
          addUsage(r.usage);
        }

        // Self-check pass #2: verify the fix actually resolved it.
        const stillIssues = [
          ...findMissingImports(existingPaths, full),
          ...findBracketIssues(full),
          ...findCssIssues(full),
          ...findExportMismatches(buildFileMap(files, full), full)
        ];

        status(
          res,
          state,
          94,
          stillIssues.length === 0
            ? "Rechecked — no issues found."
            : "Rechecked — some issues may remain. Use Fix with AI if the preview shows an error."
        );
      } else {
        status(res, state, 94, "Rechecked — no issues found.");
      }
    }

    status(res, state, 100, "Done.");

    res.write(`<<<MODEL ${used.name} / ${currentModel}>>>\n`);

    if (sawUsage) {
      res.write(
        `<<<USAGE ~${totalPromptTokens} prompt + ~${totalCompletionTokens} completion tokens>>>\n`
      );
    }

    // If we still never reached <<<END>>> after every fallback attempt,
    // don't throw the whole reply away — close it out gracefully so
    // whatever files DID finish still land in the project, and tell the
    // frontend honestly that it was a partial result.
    if (!full.includes("<<<END>>>")) {
      res.write(`\n<<<END>>>\n`);
      res.write(
        `<<<e>>>PARTIAL: The reply was cut off after trying multiple models. Files that finished were kept — ask me to continue or request fewer pages at a time.`
      );
    }

    clearTimeout(timeout);

    return res.end();
  } catch (error) {
    clearTimeout(timeout);

    console.error("Buildora backend error:", error);

    const message =
      error?.name === "AbortError"
        ? "PARTIAL: The AI took too long across every available model. Files that finished were kept — try again, or ask for fewer pages at once."
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
