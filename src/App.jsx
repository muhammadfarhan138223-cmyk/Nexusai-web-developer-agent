import { useMemo, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
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

function App() {
  const [files, setFiles] = useState(starterFiles);
  const [dependencies, setDependencies] = useState({});
  const [messages, setMessages] = useState([starterMessage]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeFile, setActiveFile] = useState("/App.js");
  const [previewMode, setPreviewMode] = useState("desktop");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const fileList = useMemo(
    () => Object.keys(files),
    [files]
  );

  // Forces Sandpack to reload when packages change,
  // otherwise newly added packages may not get installed.
  const depsKey = JSON.stringify(dependencies);

  const sendPrompt = async (overrideText) => {
    const text = (
      typeof overrideText === "string" ? overrideText : prompt
    ).trim();

    if (!text || loading) return;

    const userMessage = {
      id: Date.now(),
      role: "user",
      text
    };

    // Conversation so far (before this new message), so follow-up
    // edits have context beyond just the current file state.
    const historyForRequest = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: text,
          files: Object.fromEntries(
            Object.entries(files).map(([path, f]) => [path, f.code])
          ),
          dependencies,
          history: historyForRequest
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Something went wrong."
        );
      }

      if (data.files) {
        const nextFiles = {};

        Object.entries(data.files).forEach(([path, value]) => {
          nextFiles[path] = {
            code: typeof value === "string" ? value : value.code || ""
          };
        });

        if (Object.keys(nextFiles).length > 0) {
          setFiles((prev) => {
            const merged = { ...prev, ...nextFiles };

            (data.deleteFiles || []).forEach((path) => {
              delete merged[path];
            });

            return merged;
          });

          if (
            data.dependencies &&
            Object.keys(data.dependencies).length > 0
          ) {
            setDependencies((prev) => ({
              ...prev,
              ...data.dependencies
            }));
          }

          const firstNew = Object.keys(nextFiles)[0];
          setActiveFile(nextFiles["/App.js"] ? "/App.js" : firstNew);
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          text:
            data.message ||
            "Done. I've updated the project preview."
        }
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          error: true,
          text:
            error.message ||
            "Unable to connect to the AI backend."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetProject = () => {
    setFiles(starterFiles);
    setDependencies({});
    setActiveFile("/App.js");

    setMessages([
      {
        ...starterMessage,
        id: Date.now()
      }
    ]);
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

          <div className="projectBadge">
            Untitled project
          </div>

        </div>

        <div className="topActions">

          <button
            className="topButton"
            onClick={resetProject}
          >
            <RotateCcw size={15} />
            Reset
          </button>

          <button className="runButton">
            <Play size={14} />
            Run
          </button>

          <button className="avatarButton">
            F
          </button>

        </div>

      </header>


      {/* WORKSPACE */}
      <div className="workspace">

        {/* LEFT PANEL */}
        <aside
          className={`leftPanel ${
            sidebarOpen ? "" : "collapsed"
          }`}
        >

          <div className="chatTop">

            <div>
              <div className="sectionTitle">
                <MessageSquare size={15} />
                Assistant
              </div>

              <div className="sectionSub">
                Build your idea with AI
              </div>
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

            {messages.map((message) => (

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

                <div
                  className={`messageBubble ${
                    message.error ? "error" : ""
                  }`}
                >
                  {message.text}
                </div>

              </div>

            ))}

            {loading && (
              <div className="chatMessage assistant">

                <div className="messageAvatar">
                  <Sparkles size={14} />
                </div>

                <div className="messageBubble generating">

                  <Loader2
                    size={15}
                    className="spin"
                  />

                  Generating your website...

                </div>

              </div>
            )}

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
              onChange={(event) =>
                setPrompt(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  sendPrompt();
                }
              }}
              placeholder="Describe what you want to build..."
              disabled={loading}
            />

            <div className="composerBottom">

              <span>
                Enter to send · Shift + Enter for new line
              </span>

              <button
                className="sendButton"
                onClick={sendPrompt}
                disabled={
                  loading || !prompt.trim()
                }
              >
                {loading ? (
                  <Loader2
                    size={16}
                    className="spin"
                  />
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

            <button
              className="copyButton"
              onClick={copyCode}
            >
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

                  const filename =
                    file.replace("/", "");

                  return (
                    <button
                      key={file}
                      className={`fileRow ${
                        activeFile === file
                          ? "active"
                          : ""
                      }`}
                      onClick={() =>
                        setActiveFile(file)
                      }
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
                key={depsKey}
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
                className={
                  previewMode === "desktop"
                    ? "selected"
                    : ""
                }
                onClick={() =>
                  setPreviewMode("desktop")
                }
              >
                <Monitor size={14} />
              </button>

              <button
                className={
                  previewMode === "tablet"
                    ? "selected"
                    : ""
                }
                onClick={() =>
                  setPreviewMode("tablet")
                }
              >
                <Tablet size={14} />
              </button>

              <button
                className={
                  previewMode === "mobile"
                    ? "selected"
                    : ""
                }
                onClick={() =>
                  setPreviewMode("mobile")
                }
              >
                <Smartphone size={14} />
              </button>

              <button
                onClick={() =>
                  window.location.reload()
                }
              >
                <RefreshCw size={14} />
              </button>

            </div>

          </div>


          <div className="previewWorkspace">

            <div
              className={`previewFrame ${previewMode}`}
            >

              <SandpackProvider
                key={depsKey}
                template="react"
                files={files}
                theme="dark"
                customSetup={{ dependencies }}
                options={{
                  activeFile: "/App.js",
                  visibleFiles: fileList
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

              <button
                onClick={() =>
                  setMobileMenu(false)
                }
              >
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
                <div key={item.q} className={`faqItem ${open ? "open" : ""}`}>
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
                  {open && (
                    <p className="faqAnswer">{item.a}</p>
                  )}
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
