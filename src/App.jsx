import { useState } from "react";
import {
  Send,
  Sparkles,
  Code2,
  Eye,
  RotateCcw,
  PanelLeft,
} from "lucide-react";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
} from "@codesandbox/sandpack-react";

const initialFiles = {
  "/App.js": {
    code: `import React from "react";

export default function App() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0b1020",
      color: "white",
      fontFamily: "Arial"
    }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "42px" }}>
          Hello from AI Builder
        </h1>

        <p style={{
          color: "#9ca3af",
          fontSize: "18px"
        }}>
          Your AI-generated website appears here.
        </p>

        <button style={{
          marginTop: "20px",
          padding: "12px 22px",
          borderRadius: "10px",
          border: "none",
          background: "#2563eb",
          color: "white",
          cursor: "pointer"
        }}>
          Get Started
        </button>
      </div>
    </div>
  );
}`,
  },
};

function App() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi! I'm your AI coding assistant. Tell me what you want to build."
    }
  ]);

  const [files, setFiles] = useState(initialFiles);

  const sendMessage = () => {
    const text = message.trim();

    if (!text) return;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text,
      },
      {
        role: "assistant",
        text: "Got it. AI code generation will be connected here. For now, the Sandpack preview is running live on the right."
      }
    ]);

    setMessage("");
  };

  const resetProject = () => {
    setFiles(initialFiles);

    setMessages([
      {
        role: "assistant",
        text: "Project reset. What would you like to build?"
      }
    ]);
  };

  return (
    <div className="app">

      {/* HEADER */}
      <header className="header">

        <div className="brand">
          <div className="brandIcon">
            <Sparkles size={18} />
          </div>

          <div>
            <strong>AI Builder</strong>
            <span>Build with AI</span>
          </div>
        </div>

        <div className="headerActions">

          <button
            className="iconButton"
            onClick={resetProject}
            title="Reset"
          >
            <RotateCcw size={17} />
          </button>

          <button className="previewButton">
            <Eye size={16} />
            Preview
          </button>

        </div>

      </header>


      {/* MAIN */}
      <main className="workspace">

        {/* LEFT CHAT */}
        <aside className="chatPanel">

          <div className="chatHeader">
            <div>
              <strong>AI Assistant</strong>
              <span>Describe what you want to build</span>
            </div>

            <PanelLeft size={18} />
          </div>


          {/* MESSAGES */}
          <div className="messages">

            {messages.map((msg, index) => (
              <div
                key={index}
                className={`message ${msg.role}`}
              >

                {msg.role === "assistant" && (
                  <div className="avatar">
                    <Sparkles size={14} />
                  </div>
                )}

                <div className="messageContent">
                  {msg.text}
                </div>

              </div>
            ))}

          </div>


          {/* INPUT */}
          <div className="inputArea">

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Describe your website..."
            />

            <div className="inputBottom">

              <span>
                Press Enter to send
              </span>

              <button
                onClick={sendMessage}
                className="sendButton"
              >
                <Send size={16} />
              </button>

            </div>

          </div>

        </aside>


        {/* RIGHT BUILDER */}
        <section className="builderPanel">

          <div className="builderHeader">

            <div className="builderTitle">
              <Code2 size={17} />
              <span>Code</span>
            </div>

            <div className="status">
              <span className="statusDot" />
              Live
            </div>

          </div>


          <div className="sandpackContainer">

            <SandpackProvider
              template="react"
              files={files}
              theme="dark"
              options={{
                activeFile: "/App.js",
                visibleFiles: ["/App.js"]
              }}
            >

              <SandpackLayout>

                <SandpackCodeEditor
                  showTabs
                  showLineNumbers
                  showInlineErrors
                  wrapContent
                  style={{
                    height: "100%"
                  }}
                />

                <SandpackPreview
                  showOpenInCodeSandbox={false}
                  showRefreshButton
                  style={{
                    height: "100%"
                  }}
                />

              </SandpackLayout>

            </SandpackProvider>

          </div>

        </section>

      </main>

    </div>
  );
}

export default App;
