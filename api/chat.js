
const SYSTEM_PROMPT = `
You are Buildora, an AI web developer that builds complete, professional, multi-file React websites.


- Before answering, double-check that every file has balanced brackets and braces, valid JSX, and no duplicated closing lines at the end.

The user sends:
1. A website request.
2. The current project files (a JSON object of path -> code).
3. The currently installed npm dependencies.

Your job is to create or modify the project to fulfil the request.

RETURN ONLY VALID JSON.

Required format:

{
  "message": "2-4 friendly sentences about what you built.",
  "files": {
    "/App.js": "COMPLETE FILE CONTENT",
    "/styles.css": "COMPLETE FILE CONTENT",
    "/components/Navbar.js": "COMPLETE FILE CONTENT"
  },
  "deleteFiles": ["/old/File.js"],
  "dependencies": {
    "lucide-react": "latest"
  },
  "suggestions": [
    "Add a pricing section",
    "Switch to a light theme",
    "Add a contact form"
  ]
}

"deleteFiles" and "dependencies" are OPTIONAL. Omit them if not needed.
"message" and "suggestions" are REQUIRED.

MESSAGE RULES:

- "message" is 2-4 short, warm, energetic sentences. Say what you built, highlight 1-2 design choices, and mention the key files or components you created.
- Reply in the same language style the user wrote in (English, or Roman Urdu/Hindi if they wrote that way).
- Plain text only. No markdown, no bullet points, no code in the message.

SUGGESTIONS RULES:

- "suggestions" is an array of exactly 3 short next-step ideas the user could ask for.
- Each is written as a command, maximum 8 words, and must make sense for THIS project.

PROJECT STRUCTURE RULES:

- The project runs in Sandpack using the React template.
- /App.js is the entry component and MUST always exist. It must have a default export.
- /styles.css is the global stylesheet and is imported by the entry file automatically.
- Split larger sites into multiple files:
  - Components go in /components/ (for example /components/Navbar.js, /components/Hero.js, /components/Footer.js).
  - Extra data or helpers go in /data/ or /utils/ as .js files.
  - Extra CSS files can be added (for example /components/Navbar.css) and imported by the component that uses them.
- Every file path must start with "/", must not contain "..", and must end with one of: .js, .jsx, .css, .json.
- Use ES module imports with correct relative paths, and include the file extension for CSS imports.
- Component files must have a default export.
- Multi-page feel: use React state in /App.js to switch between "pages" (no router library needed).

FILES RULES:

- For every file you create or change, return its COMPLETE content. Never return partial snippets, diffs or placeholders like "// rest of code".
- You only need to return files that are new or changed. Files you do not return stay as they are.
- If you rename or remove a file, list the old path in "deleteFiles" and make sure nothing imports it anymore.

DEPENDENCIES RULES:

- Prefer plain React and CSS. Only add a package when it clearly helps (for example "lucide-react" for icons, "framer-motion" for animation).
- Only list packages that are NOT already installed. Use "latest" as the version.
- Never add packages that need a server, database or build step.

QUALITY RULES:

- Before answering, double-check that every file has balanced brackets and braces, valid JSX, and no duplicated closing lines at the end.
- Keep each file reasonably compact (roughly under 150 lines) so the answer is fast. Split into more components instead of writing huge files.
- Return JSON only. No markdown, no code fences, no text outside the JSON.
- Build exactly what the user asked for. Do not leave TODOs or empty sections.
- The design must look professional, modern and fully responsive (mobile first).
- Make the page fill the full width and height of the preview (for example min-height: 100vh on the main wrapper and a background colour on the body).
- Use real, believable content instead of "Lorem ipsum".
- Use accessible HTML (semantic tags, alt text, button labels).
- Do not use external image URLs that may break. Use CSS gradients, emoji, inline SVG or icon libraries instead.
- Preserve existing functionality and design unless the user asks to change it.
- Keep the code valid and runnable in Sandpack.
`;

const ALLOWED_EXTENSIONS = [".js", ".jsx", ".css", ".json"];
const MAX_FILES = 40;
const MAX_FILE_SIZE = 200000; // characters per file

function isSafePath(path) {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  if (path.includes("..")) return false;
  if (path.includes("//")) return false;
  if (path.length > 120) return false;
  return ALLOWED_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function isSafeDependencyName(name) {
  return (
    typeof name === "string" &&
    /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name) &&
    name.length <= 80
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};

    const prompt = body.prompt;
    const files = body.files || {};
    const dependencies = body.dependencies || {};
    const history = Array.isArray(body.history) ? body.history : [];

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        error: "Please enter a website request."
      });
    }

    if (prompt.length > 4000) {
      return res.status(400).json({
        error: "Your request is too long. Please shorten it."
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error:
          "OPENROUTER_API_KEY is missing. Add it in Vercel Environment Variables."
      });
    }

    const model =
      process.env.OPENROUTER_MODEL || "qwen/qwen3-coder:free";

    const userMessage = `
USER REQUEST:
${prompt}

CURRENT PROJECT FILES:
${JSON.stringify(files, null, 2)}

CURRENTLY INSTALLED DEPENDENCIES:
${JSON.stringify(dependencies, null, 2)}

Remember:
Return ONLY the required JSON object.
`;

    const conversationMessages = history
      .filter(
        (m) =>
          m &&
          typeof m.text === "string" &&
          (m.role === "user" || m.role === "assistant")
      )
      .slice(-10)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text
      }));

    const controller = new AbortController();

    // Stays active until the WHOLE response body is read (not just the
    // headers), so a slow model can never hang past Vercel's limit.
    const timeout = setTimeout(() => {
      controller.abort();
    }, 55000);

    let response;
    let rawText;

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
              "https://buildora.vercel.app",

            "X-Title": "Buildora"
          },

          body: JSON.stringify({
            model,

            messages: [
              {
                role: "system",
                content: SYSTEM_PROMPT
              },
              ...conversationMessages,
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

      rawText = await response.text();
    } finally {
      clearTimeout(timeout);
    }

    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        error: "OpenRouter returned an invalid response.",
        raw: rawText.slice(0, 500)
      });
    }

    if (!response.ok) {
      console.error("OpenRouter error:", data);

      return res.status(502).json({
        error:
          data?.error?.message ||
          data?.message ||
          `OpenRouter request failed (${response.status}).`
      });
    }

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({
        error: "AI returned an empty response."
      });
    }

    let cleaned = content.trim();

    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    let result;

    try {
      result = JSON.parse(cleaned);
    } catch (error) {
      console.error("AI JSON parse failed:", cleaned.slice(0, 1000));

      return res.status(502).json({
        error:
          "AI generated invalid website data. Please try again."
      });
    }

    if (
      !result ||
      typeof result !== "object" ||
      !result.files ||
      typeof result.files !== "object" ||
      Array.isArray(result.files)
    ) {
      return res.status(502).json({
        error: "AI response did not contain valid website files."
      });
    }

    /*
     * Validate and clean every returned file.
     */
    const cleanFiles = {};

    for (const [path, code] of Object.entries(result.files)) {
      if (!isSafePath(path)) {
        console.warn("Skipping unsafe file path:", path);
        continue;
      }

      if (typeof code !== "string" || code.length === 0) {
        continue;
      }

      if (code.length > MAX_FILE_SIZE) {
        console.warn("Skipping oversized file:", path);
        continue;
      }

      cleanFiles[path] = code;
    }

    if (Object.keys(cleanFiles).length === 0) {
      return res.status(502).json({
        error: "AI did not return any usable files. Please try again."
      });
    }

    if (Object.keys(cleanFiles).length > MAX_FILES) {
      return res.status(502).json({
        error: "AI returned too many files. Try a simpler request."
      });
    }

    const deleteFiles = Array.isArray(result.deleteFiles)
      ? result.deleteFiles.filter(
          (p) => isSafePath(p) && p !== "/App.js"
        )
      : [];

    const appWillExist =
      typeof cleanFiles["/App.js"] === "string" ||
      typeof files["/App.js"] !== "undefined";

    if (!appWillExist) {
      return res.status(502).json({
        error: "AI response is missing /App.js."
      });
    }

    /*
     * Validate dependencies.
     */
    const cleanDependencies = {};

    if (
      result.dependencies &&
      typeof result.dependencies === "object" &&
      !Array.isArray(result.dependencies)
    ) {
      for (const name of Object.keys(result.dependencies)) {
        if (isSafeDependencyName(name)) {
          cleanDependencies[name] = "latest";
        }
      }
    }

    /*
     * Follow-up ideas shown as clickable buttons in the chat.
     */
    const cleanSuggestions = Array.isArray(result.suggestions)
      ? result.suggestions
          .filter((s) => typeof s === "string" && s.trim())
          .map((s) => s.trim().slice(0, 80))
          .slice(0, 3)
      : [];

    return res.status(200).json({
      message:
        typeof result.message === "string" && result.message.trim()
          ? result.message.trim()
          : "Your website is ready — take a look at the live preview.",

      files: cleanFiles,
      deleteFiles,
      dependencies: cleanDependencies,
      suggestions: cleanSuggestions
    });
  } catch (error) {
    console.error("Buildora backend error:", error);

    if (error?.name === "AbortError") {
      return res.status(504).json({
        error:
          "The AI took too long to respond. Please try again, or ask for a smaller change."
      });
    }

    return res.status(500).json({
      error:
        error?.message ||
        "Buildora could not generate the website."
    });
  }
}
  return ALLOWED_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function isSafeDependencyName(name) {
  return (
    typeof name === "string" &&
    /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name) &&
    name.length <= 80
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};

    const prompt = body.prompt;
    const files = body.files || {};
    const dependencies = body.dependencies || {};
    const history = Array.isArray(body.history) ? body.history : [];

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        error: "Please enter a website request."
      });
    }

    if (prompt.length > 4000) {
      return res.status(400).json({
        error: "Your request is too long. Please shorten it."
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error:
          "OPENROUTER_API_KEY is missing. Add it in Vercel Environment Variables."
      });
    }

    const model =
      process.env.OPENROUTER_MODEL || "qwen/qwen3-coder:free";

    const userMessage = `
USER REQUEST:
${prompt}

CURRENT PROJECT FILES:
${JSON.stringify(files, null, 2)}

CURRENTLY INSTALLED DEPENDENCIES:
${JSON.stringify(dependencies, null, 2)}

Remember:
Return ONLY the required JSON object.
`;

    const conversationMessages = history
      .filter(
        (m) =>
          m &&
          typeof m.text === "string" &&
          (m.role === "user" || m.role === "assistant")
      )
      .slice(-10)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text
      }));

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 55000);

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
              "https://buildora.vercel.app",

            "X-Title": "Buildora"
          },

          body: JSON.stringify({
            model,

            messages: [
              {
                role: "system",
                content: SYSTEM_PROMPT
              },
              ...conversationMessages,
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

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        error: "OpenRouter returned an invalid response.",
        raw: rawText.slice(0, 500)
      });
    }

    if (!response.ok) {
      console.error("OpenRouter error:", data);

      return res.status(502).json({
        error:
          data?.error?.message ||
          data?.message ||
          `OpenRouter request failed (${response.status}).`
      });
    }

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({
        error: "AI returned an empty response."
      });
    }

    let cleaned = content.trim();

    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    let result;

    try {
      result = JSON.parse(cleaned);
    } catch (error) {
      console.error("AI JSON parse failed:", cleaned.slice(0, 1000));

      return res.status(502).json({
        error:
          "AI generated invalid website data. Please try again."
      });
    }

    if (
      !result ||
      typeof result !== "object" ||
      !result.files ||
      typeof result.files !== "object" ||
      Array.isArray(result.files)
    ) {
      return res.status(502).json({
        error: "AI response did not contain valid website files."
      });
    }

    /*
     * Validate and clean every returned file.
     */
    const cleanFiles = {};

    for (const [path, code] of Object.entries(result.files)) {
      if (!isSafePath(path)) {
        console.warn("Skipping unsafe file path:", path);
        continue;
      }

      if (typeof code !== "string" || code.length === 0) {
        continue;
      }

      if (code.length > MAX_FILE_SIZE) {
        console.warn("Skipping oversized file:", path);
        continue;
      }

      cleanFiles[path] = code;
    }

    if (Object.keys(cleanFiles).length === 0) {
      return res.status(502).json({
        error: "AI did not return any usable files. Please try again."
      });
    }

    if (Object.keys(cleanFiles).length > MAX_FILES) {
      return res.status(502).json({
        error: "AI returned too many files. Try a simpler request."
      });
    }

    /*
     * /App.js must exist either in this response or already in the project.
     */
    const deleteFiles = Array.isArray(result.deleteFiles)
      ? result.deleteFiles.filter(
          (p) => isSafePath(p) && p !== "/App.js"
        )
      : [];

    const appWillExist =
      typeof cleanFiles["/App.js"] === "string" ||
      typeof files["/App.js"] !== "undefined";

    if (!appWillExist) {
      return res.status(502).json({
        error: "AI response is missing /App.js."
      });
    }

    /*
     * Validate dependencies.
     */
    const cleanDependencies = {};

    if (
      result.dependencies &&
      typeof result.dependencies === "object" &&
      !Array.isArray(result.dependencies)
    ) {
      for (const name of Object.keys(result.dependencies)) {
        if (isSafeDependencyName(name)) {
          cleanDependencies[name] = "latest";
        }
      }
    }

    return res.status(200).json({
      message:
        typeof result.message === "string"
          ? result.message
          : "Website generated successfully.",

      files: cleanFiles,
      deleteFiles,
      dependencies: cleanDependencies
    });
  } catch (error) {
    console.error("Buildora backend error:", error);

    if (error?.name === "AbortError") {
      return res.status(504).json({
        error: "AI took too long to respond. Please try again."
      });
    }

    return res.status(500).json({
      error:
        error?.message ||
        "Buildora could not generate the website."
    });
  }
      }
