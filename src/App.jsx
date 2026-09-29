import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileText,
  FolderOpen,
  Loader2,
  Menu,
  MessageSquare,
  Monitor,
  PanelLeft,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Tablet,
  Smartphone,
  X,
  Zap
} from "lucide-react";

import {
  SandpackCodeEditor,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
  useSandpack
} from "@codesandbox/sandpack-react";
import { downloadProjectZip } from "./zip";
import { useSeo } from "./seo";
import { getProject, getUser, makeId, saveProject } from "./store";

const starterFiles = {
  "/App.js": {
    code: `import React from "react";
import "./styles.css";

export default function App() {
  return (
    <main className="page">
      <section className="hero">
        <div className="badge">
          <span className="dot"></span>
          Built with Buildora
        </div>

        <h1>
          Build something
          <span> remarkable.</span>
        </h1>

        <p>
          Describe your idea and let AI turn it into a
          beautiful working website.
        </p>

        <div className="actions">
          <button className="primary">
            Start Building
          </button>

          <button className="secondary">
            Explore
          </button>
        </div>
      </section>
    </main>
  );
}
`
  },

  "/styles.css": {
    code: `* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, Arial, sans-serif;
  background: #070a12;
  color: #ffffff;
}

button {
  font: inherit;
}

.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 40px 20px;
  background:
    radial-gradient(
      circle at 50% 20%,
      rgba(37, 99, 235, 0.18),
      transparent 38%
    ),
    #070a12;
}

.hero {
  max-width: 760px;
  text-align: center;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 13px;
  border: 1px solid #263044;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.7);
  color: #aeb9cc;
  font-size: 13px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 14px #38bdf8;
}

h1 {
  margin: 25px 0 18px;
  font-size: clamp(42px, 7vw, 76px);
  line-height: 0.98;
  letter-spacing: -4px;
}

h1 span {
  color: #60a5fa;
}

p {
  max-width: 570px;
  margin: auto;
  color: #8f9bb0;
  font-size: 18px;
  line-height: 1.7;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 32px;
}

.actions button {
  border-radius: 12px;
  padding: 13px 21px;
  cursor: pointer;
}

.primary {
  border: 0;
  color: white;
  background: #2563eb;
}

.secondary {
  border: 1px solid #293449;
  color: #dce5f4;
  background: #101622;
}
`
  }
};

const starterMessage = {
  id: 1,
  role: "assistant",
  text: "Welcome to Buildora. Describe the website you want to build and I'll generate the code for the live preview."
};

const STORAGE_KEY = "buildora_project_v1";

const GENERATION_STEPS = [
  "Understanding your idea",
  "Planning pages and components",
  "Writing the code",
  "Styling and polishing the design",
  "Final checks — almost ready"
];

const faqs = [
  {
    q: "Is Buildora free to use?",
    a: "Yes. Buildora runs on a free AI model, so there's no cost to describe your idea and get a working website preview."
  },
  {
    q: "Do I need to know how to code?",
    a: "No. Just describe what you want in plain English (or Roman Urdu/Hindi) and Buildora writes the React and CSS code for you, with a live preview."
  },
  {
    q: "What can I build with it?",
    a: "Landing pages, portfolios, small business sites, SaaS-style pages, and more — multi-file React projects with components, styles and a live preview."
  },
  {
    q: "Who built Buildora?",
    a: "Buildora was built by Farhan Balouch, a developer and entrepreneur from Ahmadpur East, Pakistan, working in AI, SEO, and online business."
  },
  {
    q: "Is my data safe?",
    a: "Your prompts and generated code are sent only to the AI model needed to build your site — nothing is sold or shared."
  }
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const ALLOWED_EXT = [".js", ".jsx", ".css", ".json"];

function isSafePath(p) {
  return (
    typeof p === "string" &&
    p.startsWith("/") &&
    !p.includes("..") &&
    !p.includes("//") &&
    p.length <= 120 &&
    ALLOWED_EXT.some((e) => p.endsWith(e))
  );
}

function isSafeDep(name) {
  return (
    typeof name === "string" &&
    name.length <= 80 &&
    /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)
  );
}

function stripFences(code) {
  return code
    .replace(/^```[a-z]*\n/i, "")
    .replace(/\n```\s*$/, "");
}

const TAG_RE =
  /<<<(MESSAGE|QUESTION|STATUS|MODEL|USAGE|FILE|DELETE|DEPS|SUGGESTIONS|END)(?: ([^>\n]+?))?>>>/g;

function parseBuild(text) {
  const out = {
    message: "",
    files: {},
    deleteFiles: [],
    dependencies: {},
    suggestions: [],
    complete: false
  };

  const marks = [...text.matchAll(TAG_RE)];

  marks.forEach((m, i) => {
    const kind = m[1];
    const arg = (m[2] || "").trim();
    const end = marks[i + 1] ? marks[i + 1].index : text.length;
    const body = text
      .slice(m.index + m[0].length, end)
      .replace(/^\n/, "")
      .replace(/\s+$/, "");

    if (kind === "MESSAGE" || kind === "QUESTION") {
      out.message = body;
    } else if (kind === "FILE") {
      if (isSafePath(arg) && body) out.files[arg] = stripFences(body);
    } else if (kind === "DELETE") {
      if (isSafePath(arg) && arg !== "/App.js") out.deleteFiles.push(arg);
    } else if (kind === "DEPS") {
      body
        .split("\n")
        .map((s) => s.trim())
        .filter(isSafeDep)
        .forEach((name) => {
          out.dependencies[name] = "latest";
        });
    } else if (kind === "SUGGESTIONS") {
      out.suggestions = body
        .split("\n")
        .map((s) => s.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 3);
    } else if (kind === "END") {
      out.complete = true;
    }
  });

  return out;
}

// Loads the last saved project from this browser, if any and valid.
function loadSavedProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const saved = JSON.parse(raw);

    if (
      saved &&
      saved.files &&
      saved.files["/App.js"] &&
      typeof saved.files["/App.js"].code === "string"
    ) {
      return saved;
    }
  } catch {
    // Corrupt or blocked storage — just start fresh.
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */

// Types the assistant's reply out letter by letter (newest message only).
function TypedText({ text, animate }) {
  const [shown, setShown] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate) {
      setShown(text.length);
      return undefined;
    }

    setShown(0);

    const step = Math.max(1, Math.ceil(text.length / 90));

    const id = setInterval(() => {
      setShown((n) => {
        if (n >= text.length) {
          clearInterval(id);
          return n;
        }
        return Math.min(text.length, n + step);
      });
    }, 22);

    return () => clearInterval(id);
  }, [text, animate]);

  return (
    <>
      {text.slice(0, shown)}
      {animate && shown < text.length && (
        <span className="typingCaret" />
      )}
    </>
  );
}

// Live progress shown while the AI is generating.
function GeneratingSteps() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const active = Math.min(
    GENERATION_STEPS.length - 1,
    Math.floor(seconds / 6)
  );

  return (
    <div className="genSteps">
      <div className="genHeader">
        <Loader2 size={14} className="spin" />
        <span>Buildora is working on it</span>
        <span className="genTimer">{seconds}s</span>
      </div>

      <ul>
        {GENERATION_STEPS.map((label, i) => (
          <li
            key={label}
            className={
              i < active ? "done" : i === active ? "active" : ""
            }
          >
            {i < active ? (
              <Check size={13} />
            ) : i === active ? (
              <Loader2 size={13} className="spin" />
            ) : (
              <span className="stepDot" />
            )}
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Shows which files were created / updated / removed by a reply.
function ChangesCard({ changes, packages, onOpen }) {
  const hasChanges = changes && changes.length > 0;
  const hasPackages = packages && packages.length > 0;

  if (!hasChanges && !hasPackages) return null;

  const labels = {
    created: "New",
    updated: "Updated",
    deleted: "Removed"
  };

  return (
    <div className="changesCard">
      {hasChanges && (
        <>
          <div className="changesTitle">
            <FileCode2 size={13} />
            {changes.length} file{changes.length === 1 ? "" : "s"} changed
          </div>

          {changes.map((c) => (
            <button
              key={`${c.path}-${c.action}`}
              className="changeRow"
              disabled={c.action === "deleted"}
              onClick={() => onOpen(c.path)}
            >
              <span className="changePath">
                {c.path.replace(/^\//, "")}
              </span>
              <span className={`changeBadge ${c.action}`}>
                {labels[c.action]}
              </span>
            </button>
          ))}
        </>
      )}

      {hasPackages && (
        <div className="changesDeps">
          Added packages: {packages.join(", ")}
        </div>
      )}
    </div>
  );
}

// Shown at the bottom of the preview when the generated code has an error.
function ErrorFixer({ onFix, loading }) {
  const { sandpack } = useSandpack();
  const error = sandpack.error;

  if (!error) return null;

  const cleanMessage = String(error.message || "Unknown error").slice(0, 1500);

  return (
    <div className="fixBar">
      <span className="fixBarText">Preview has an error</span>
      <button
        className="fixBarButton"
        disabled={loading}
        onClick={() =>
          onFix(
            "The live preview shows this error. Fix it and return the corrected COMPLETE file(s):\n\n" +
              cleanMessage
          )
        }
      >
        {loading ? "Fixing..." : "Fix with AI"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main App                                                            */
/* ------------------------------------------------------------------ */

function App() {
  // Read the saved project once, on first load only.
  useSeo("Buildora Builder", "Build websites with AI.", {
    noindex: true,
    path: "/app"
  });

  const urlParams = new URLSearchParams(window.location.search);
  const [projectId, setProjectId] = useState(
    () => urlParams.get("p") || makeId()
  );
  const [user] = useState(getUser);
  const [zipping, setZipping] = useState(false);

  const [savedProject] = useState(() => {
    const pid = urlParams.get("p");
    return (pid && getProject(pid)) || loadSavedProject();
  });
  const [files, setFiles] = useState(savedProject?.files || starterFiles);
  const [dependencies, setDependencies] = useState(
    savedProject?.dependencies || { "lucide-react": "latest" }
  );
  const [messages, setMessages] = useState(
    savedProject?.messages?.length ? savedProject.messages : [starterMessage]
  );
  const [prompt, setPrompt] = useState(() => urlParams.get("idea") || "");
  const [loading, setLoading] = useState(false);
  const [activeFile, setActiveFile] = useState("/App.js");
  const [previewMode, setPreviewMode] = useState("desktop");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [previewKey, setPreviewKey] = useState(0);
  const chatEndRef = useRef(null);

  const fileList = useMemo(() => Object.keys(files), [files]);

  // Forces Sandpack to reload when packages change (or when the refresh
  // button is pressed), otherwise new packages may not get installed.
  const depsKey = JSON.stringify(dependencies);
  const providerKey = `${depsKey}-${previewKey}`;

  // Auto-save the project in this browser so a refresh doesn't lose work.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          files,
          dependencies,
          messages: messages
            .slice(-30)
            .map(({ animate, ...rest }) => rest)
        })
      );
    } catch {
      // Storage full or blocked — saving is a bonus, never fatal.
    }

    // Recent projects list (shown on the home page).
    const firstPrompt = messages.find((m) => m.role === "user");
    if (firstPrompt) {
      saveProject({
        id: projectId,
        name: firstPrompt.text.slice(0, 48),
        files,
        dependencies,
        messages: messages.slice(-30).map(({ animate, ...rest }) => rest)
      });
    }
  }, [files, dependencies, messages, projectId]);

  const downloadZip = async () => {
    if (zipping) return;
    setZipping(true);
    try {
      const first = messages.find((m) => m.role === "user");
      await downloadProjectZip(files, dependencies, first?.text.slice(0, 40));
    } finally {
      setZipping(false);
    }
  };

  // Keep the newest chat message in view.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messages, loading]);

  const sendPrompt = async (overrideText) => {
    const isOverride = typeof overrideText === "string";
    const text = (isOverride ? overrideText : prompt).trim();

    if (!text || loading) return;

    const userMessage = { id: Date.now(), role: "user", text };

    // Conversation so far (before this new message), so follow-up
    // edits have context beyond just the current file state.
    const historyForRequest = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMessage]);

    // Keep whatever the user was typing when this is an automatic
    // request (Fix with AI / suggestion button).
    if (!isOverride) setPrompt("");

    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          files: Object.fromEntries(
            Object.entries(files).map(([path, f]) => [path, f.code])
          ),
          dependencies,
          history: historyForRequest
        })
      });

      if (!response.ok) {
        const errRaw = await response.text();
        let msg = "Server error. Please try again.";
        try {
          msg = JSON.parse(errRaw).error || msg;
        } catch {
          if (response.status === 504 || /timeout/i.test(errRaw)) {
            msg = "The server stopped the request. Try a smaller change.";
          }
        }
        throw new Error(msg);
      }

      const modelUsed =
        (response.headers.get("X-Model-Provider") || "") +
        (response.headers.get("X-Model-Name")
          ? " / " + response.headers.get("X-Model-Name")
          : "");

      // Read the streamed reply until it finishes.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();

      const errMatch = raw.match(/<<<e>>>([\s\S]*)$/);
      if (errMatch) throw new Error(errMatch[1].trim());

      const data = parseBuild(raw);

      if (!data.complete) {
        throw new Error(
          "The AI reply was cut off. Ask for fewer pages at a time."
        );
      }
 const isQuestion = /<<<QUESTION>>>/.test(raw);

      if (!isQuestion && Object.keys(data.files).length === 0) {
        throw new Error("The AI did not return any files. Please try again.");
      }

      if (!isQuestion && !data.files["/App.js"] && !files["/App.js"]) {
        throw new Error("The AI response is missing /App.js.");
      }

      const changes = [];
      const nextFiles = {};

      Object.entries(data.files).forEach(([path, code]) => {
        nextFiles[path] = { code };
        changes.push({
          path,
          action: files[path] ? "updated" : "created"
        });
      });

      data.deleteFiles.forEach((path) => {
        if (files[path]) changes.push({ path, action: "deleted" });
      });

      setFiles((prev) => {
        const merged = { ...prev, ...nextFiles };
        data.deleteFiles.forEach((path) => {
          delete merged[path];
        });
        return merged;
      });

      if (Object.keys(data.dependencies).length > 0) {
        setDependencies((prev) => ({ ...prev, ...data.dependencies }));
      }

      const firstNew = Object.keys(nextFiles)[0];
      setActiveFile(nextFiles["/App.js"] ? "/App.js" : firstNew);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          animate: true,
          text: data.message || "Done. I've updated the project preview.",
          changes,
          packages: Object.keys(data.dependencies),
          model: modelUsed,
          suggestions: data.suggestions
        }
      ]);
    } catch (error) {
      const networkFail =
        error instanceof TypeError || /failed to fetch/i.test(error.message);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          error: true,
          text: networkFail
            ? "Connection toot gaya. Dobara try karo, ya request chhoti karo."
            : error.message || "Unable to connect to the AI backend."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetProject = () => {
    setProjectId(makeId());
    window.history.replaceState(null, "", "/app");
    setFiles(starterFiles);
    setDependencies({});
    setActiveFile("/App.js");

    setMessages([
      {
        ...starterMessage,
        id: Date.now()
      }
    ]);

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const copyCode = async () => {
    const code = files[activeFile]?.code || "";

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1400);
    } catch {
      // Clipboard may be blocked by browser permissions.
    }
  };

  const fileIcon = (path) => {
    if (path.endsWith(".css")) {
      return <FileText size={15} />;
    }

    return <FileCode2 size={15} />;
  };

  return (
    <>
      <div className="appShell">
        {/* TOP BAR */}
        <header className="topbar">
          <div className="brandArea">
            <button
              className="mobileIcon"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={18} />
            </button>

            <div className="nexusLogo">
              <span>B</span>
            </div>

            <div className="brandText">
              <strong>BUILDORA</strong>
              <small>AI WEB BUILDER</small>
            </div>

            <div className="projectBadge">Untitled project</div>
          </div>

          <div className="topActions">
            <a
              className="topButton"
              href="/"
              style={{ textDecoration: "none" }}
            >
              Home
            </a>

            <button className="topButton" onClick={downloadZip} disabled={zipping}>
              <Download size={15} />
              {zipping ? "Zipping..." : "Download ZIP"}
            </button>

            <button className="topButton" onClick={resetProject}>
              <RotateCcw size={15} />
              Reset
            </button>

            <button
              className="runButton"
              onClick={() => setPreviewKey((k) => k + 1)}
            >
              <Play size={14} />
              Run
            </button>

            <button
              className="avatarButton"
              title={user ? user.name : "Log in"}
              onClick={() => {
                window.location.href = user ? "/" : "/login?next=/app";
              }}
            >
              {user ? user.name.trim()[0].toUpperCase() : "G"}
            </button>
          </div>
        </header>

        {/* WORKSPACE */}
        <div className="workspace">
          {/* LEFT PANEL */}
          <aside
            className={`leftPanel ${sidebarOpen ? "" : "collapsed"}`}
          >
            <div className="chatTop">
              <div>
                <div className="sectionTitle">
                  <MessageSquare size={15} />
                  Assistant
                </div>

                <div className="sectionSub">Build your idea with AI</div>
              </div>

              <button
                className="smallIcon"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeft size={16} />
              </button>
            </div>

            {/* CHAT */}
            <div className="chatMessages">
              {messages.map((message, index) => {
                const isLast = index === messages.length - 1;

                return (
                  <div
                    key={message.id}
                    className={`chatMessage ${message.role}`}
                  >
                    {message.role === "assistant" && (
                      <div className="messageAvatar">
                        {message.error ? (
                          <Zap size={14} />
                        ) : (
                          <Sparkles size={14} />
                        )}
                      </div>
                    )}

                    {message.role === "assistant" ? (
                      <div className="messageColumn">
                        <div
                          className={`messageBubble ${
                            message.error ? "error" : ""
                          }`}
                        >
                          <TypedText
                            text={message.text}
                            animate={!!message.animate && isLast}
                          />
                        </div>

                        {message.model && (
                          <div
                            style={{
                              fontSize: 11,
                              opacity: 0.55,
                              margin: "4px 2px 0"
                            }}
                          >
                            Model: {message.model}
                          </div>
                        )}

                        <ChangesCard
                          changes={message.changes}
                          packages={message.packages}
                          onOpen={setActiveFile}
                        />

                        {isLast &&
                          !loading &&
                          message.suggestions?.length > 0 && (
                            <div className="followUps">
                              {message.suggestions.map((s) => (
                                <button
                                  key={s}
                                  onClick={() => sendPrompt(s)}
                                >
                                  <Sparkles size={12} />
                                  {s}
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="messageBubble">{message.text}</div>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div className="chatMessage assistant">
                  <div className="messageAvatar">
                    <Sparkles size={14} />
                  </div>

                  <div className="messageColumn">
                    <div className="messageBubble">
                      <GeneratingSteps />
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* SUGGESTIONS */}
            {messages.length <= 1 && (
              <div className="suggestions">
                <button
                  onClick={() =>
                    setPrompt(
                      "Create a premium SaaS landing page with a dark design, hero section, features, pricing and responsive layout."
                    )
                  }
                >
                  <Sparkles size={14} />
                  SaaS landing page
                </button>

                <button
                  onClick={() =>
                    setPrompt(
                      "Create a modern portfolio website for a creative developer with projects, about section and contact CTA."
                    )
                  }
                >
                  <Code2 size={14} />
                  Developer portfolio
                </button>
              </div>
            )}

            {/* PROMPT */}
            <div className="composer">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendPrompt();
                  }
                }}
                placeholder="Describe what you want to build..."
                disabled={loading}
              />

              <div className="composerBottom">
                <span>Enter to send · Shift + Enter for new line</span>

                <button
                  className="sendButton"
                  onClick={() => sendPrompt()}
                  disabled={loading || !prompt.trim()}
                >
                  {loading ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <ArrowUp size={17} />
                  )}
                </button>
              </div>
            </div>
          </aside>

          {/* COLLAPSED LEFT */}
          {!sidebarOpen && (
            <button
              className="expandSidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeft size={17} />
            </button>
          )}

          {/* CENTER EDITOR */}
          <section className="editorPanel">
            <div className="panelHeader">
              <div className="panelHeading">
                <Code2 size={15} />
                Code
              </div>

              <button className="copyButton" onClick={copyCode}>
                <Copy size={14} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="editorBody">
              <div className="fileTree">
                <div className="treeHeader">
                  <span>FILES</span>

                  <button>
                    <Plus size={14} />
                  </button>
                </div>

                <div className="treeFolder">
                  <div className="folderRow">
                    <FolderOpen size={15} />
                    <span>src</span>
                    <ChevronDown size={13} />
                  </div>

                  {fileList.map((file) => {
                    const filename = file.replace("/", "");

                    return (
                      <button
                        key={file}
                        className={`fileRow ${
                          activeFile === file ? "active" : ""
                        }`}
                        onClick={() => setActiveFile(file)}
                      >
                        {fileIcon(file)}
                        <span>{filename}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="codeArea">
                <SandpackProvider
                  key={`${providerKey}-${activeFile}`}
                  template="react"
                  files={files}
                  theme="dark"
                  customSetup={{ dependencies }}
                  options={{
                    activeFile,
                    visibleFiles: fileList
                  }}
                >
                  <SandpackLayout>
                    <SandpackCodeEditor
                      showTabs
                      showLineNumbers
                      showInlineErrors
                      wrapContent
                      closableTabs={false}
                      style={{
                        height: "100%",
                        width: "100%"
                      }}
                    />
                  </SandpackLayout>
                </SandpackProvider>
              </div>
            </div>
          </section>

          {/* RIGHT PREVIEW */}
          <section className="previewPanel">
            <div className="panelHeader">
              <div className="panelHeading">
                <Eye size={15} />
                Preview
                <span className="liveBadge">
                  <span></span>
                  Live
                </span>
              </div>

              <div className="previewControls">
                <button
                  className={previewMode === "desktop" ? "selected" : ""}
                  onClick={() => setPreviewMode("desktop")}
                >
                  <Monitor size={14} />
                </button>

                <button
                  className={previewMode === "tablet" ? "selected" : ""}
                  onClick={() => setPreviewMode("tablet")}
                >
                  <Tablet size={14} />
                </button>

                <button
                  className={previewMode === "mobile" ? "selected" : ""}
                  onClick={() => setPreviewMode("mobile")}
                >
                  <Smartphone size={14} />
                </button>

                <button onClick={() => setPreviewKey((k) => k + 1)}>
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            <div className="previewWorkspace">
              <div className={`previewFrame ${previewMode}`}>
                <SandpackProvider
                  key={providerKey}
                  template="react"
                  files={files}
                  theme="dark"
                  customSetup={{ dependencies }}
                  options={{
                    activeFile: "/App.js",
                    visibleFiles: fileList,
                    bundlerTimeOut: 120000
                  }}
                >
                  <SandpackLayout>
                    <SandpackPreview
                      showOpenInCodeSandbox={false}
                      showRefreshButton
                      style={{
                        height: "100%",
                        width: "100%"
                      }}
                    />
                  </SandpackLayout>

                  <ErrorFixer onFix={sendPrompt} loading={loading} />
                </SandpackProvider>
              </div>
            </div>
          </section>
        </div>

        {/* MOBILE DRAWER */}
        {mobileMenu && (
          <div className="mobileOverlay">
            <div className="mobileDrawer">
              <div className="drawerHeader">
                <strong>BUILDORA</strong>

                <button onClick={() => setMobileMenu(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="drawerContent">
                <button
                  onClick={() => {
                    resetProject();
                    setMobileMenu(false);
                  }}
                >
                  <RotateCcw size={16} />
                  Reset project
                </button>

                <button
                  onClick={() => {
                    setSidebarOpen(true);
                    setMobileMenu(false);
                  }}
                >
                  <MessageSquare size={16} />
                  Assistant
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="siteFooter">
        <div className="footerInner">
          <section className="founderBlock">
            <div className="founderAvatar">FB</div>
            <div>
              <h2>Built by Farhan Balouch</h2>
              <p>
                Buildora is an independent project by{" "}
                <strong>Farhan Balouch</strong>, a developer and
                entrepreneur from Ahmadpur East, Pakistan, working in AI,
                SEO, and online business. Buildora is part of his ongoing
                work exploring what AI can build.
              </p>
              <a
                href="https://farhanbalouch.com"
                target="_blank"
                rel="noopener noreferrer"
                className="founderLink"
              >
                farhanbalouch.com
                <ChevronRight size={14} />
              </a>
            </div>
          </section>

          <section className="faqBlock">
            <h2>Frequently asked questions</h2>

            <div className="faqList">
              {faqs.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div
                    key={item.q}
                    className={`faqItem ${open ? "open" : ""}`}
                  >
                    <button
                      className="faqQuestion"
                      onClick={() => setOpenFaq(open ? null : i)}
                    >
                      <span>{item.q}</span>
                      <ChevronDown
                        size={16}
                        className={`faqChevron ${open ? "rotated" : ""}`}
                      />
                    </button>
                    {open && <p className="faqAnswer">{item.a}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="footerBottom">
          <span>© {new Date().getFullYear()} Buildora</span>
          <span className="footerDot">•</span>
          <a
            href="https://farhanbalouch.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            A project by Farhan Balouch
          </a>
        </div>
      </footer>
    </>
  );
}

export default App;
