import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Code2,
  Download,
  FolderOpen,
  Layers,
  Menu,
  Rocket,
  Smartphone,
  Sparkles,
  Trash2,
  X,
  Zap
} from "lucide-react";
import "../landing.css";
import { FAQS, OWNER, SITE_NAME } from "../site";
import { useSeo } from "../seo";
import { deleteProject, getUser, listProjects, logoutUser } from "../store";

const FEATURES = [
  { icon: Sparkles, title: "Prompt to website", text: "Describe your idea in plain English or Roman Urdu. Buildora designs and codes the whole site for you." },
  { icon: Layers, title: "Multi-page ready", text: "Home, pricing, blog, contact and more, built as clean shared components instead of one giant file." },
  { icon: Smartphone, title: "Responsive by default", text: "Every site adapts to phone, tablet and desktop, and you can preview all three sizes live." },
  { icon: Code2, title: "Real React code", text: "Open any file, edit it, or ask the AI to change it. No lock-in, it is normal React and CSS." },
  { icon: Download, title: "Download as ZIP", text: "Export a full Vite + React project and run it anywhere, or deploy it to Vercel in minutes." },
  { icon: Zap, title: "Free and fast", text: "Powered by free AI models with automatic fallback, so a busy model never stops your build." }
];

const STEPS = [
  { n: "01", title: "Describe it", text: "Type what you want, for example a dark SaaS landing page with pricing." },
  { n: "02", title: "Watch it build", text: "Buildora plans the design, writes the files and shows a live preview." },
  { n: "03", title: "Refine and export", text: "Ask for changes in chat, then download the code or keep it in your recent projects." }
];

const IDEAS = [
  "Dark SaaS landing page with pricing",
  "Photographer portfolio with gallery",
  "Restaurant website with menu and booking",
  "Personal blog with dark and light theme"
];

const go = (path) => {
  window.location.href = path;
};

function Header({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const links = [
    ["Features", "#features"],
    ["How it works", "#how"],
    ["Recent projects", "#projects"],
    ["FAQ", "#faq"]
  ];
  return (
    <header className="lp-header">
      <div className="lp-container lp-header-inner">
        <a className="lp-logo" href="/" aria-label={`${SITE_NAME} home`}>
          <span className="lp-logo-mark">B</span>
          <span>{SITE_NAME}</span>
        </a>
        <nav className={`lp-nav ${open ? "open" : ""}`} aria-label="Main">
          {links.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          <div className="lp-nav-actions">
            {user ? (
              <button className="lp-btn ghost" onClick={onLogout}>
                Log out
              </button>
            ) : (
              <a className="lp-btn ghost" href="/login">
                Log in
              </a>
            )}
            <a className="lp-btn primary" href="/app">
              Start building <ArrowRight size={15} />
            </a>
          </div>
        </nav>
        <button
          className="lp-burger"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-grid">
        <div>
          <a className="lp-logo" href="/">
            <span className="lp-logo-mark">B</span>
            <span>{SITE_NAME}</span>
          </a>
          <p className="lp-muted">
            The free AI website builder. Describe your idea, get a live React
            website, download the code.
          </p>
        </div>
        <div>
          <h4>Product</h4>
          <a href="/app">Open builder</a>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#projects">Recent projects</a>
        </div>
        <div>
          <h4>Account</h4>
          <a href="/login">Log in</a>
          <a href="#faq">FAQ</a>
        </div>
        <div>
          <h4>Creator</h4>
          <a href={OWNER.url} rel="author noopener" target="_blank">
            {OWNER.name}
          </a>
          <a href={OWNER.url} target="_blank" rel="noopener">
            farhanbalouch.com
          </a>
        </div>
      </div>
      <div className="lp-container lp-footer-bottom">
        <span>
          © {new Date().getFullYear()} {SITE_NAME}. Built by{" "}
          <a href={OWNER.url} rel="author noopener" target="_blank">
            {OWNER.name}
          </a>
          .
        </span>
      </div>
    </footer>
  );
}

export default function Landing() {
  useSeo(
    "Buildora - Free AI Website Builder | Build & Download React Websites",
    "Buildora is a free AI website builder. Describe your idea in plain words, get a live multi-page website and download the full React code as a ZIP. Built by Farhan Balouch."
  );

  const [user, setUser] = useState(getUser);
  const [projects, setProjects] = useState([]);
  const [idea, setIdea] = useState("");
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => setProjects(listProjects()), []);

  const start = (text) => {
    const t = (text ?? idea).trim();
    go(t ? `/app?idea=${encodeURIComponent(t)}` : "/app");
  };

  return (
    <div className="lp">
      <Header
        user={user}
        onLogout={() => {
          logoutUser();
          setUser(null);
        }}
      />

      <main>
        <section className="lp-hero">
          <div className="lp-glow" aria-hidden="true" />
          <div className="lp-container lp-hero-inner">
            <span className="lp-pill">
              <Rocket size={14} /> Free AI website builder
            </span>
            <h1>
              Turn your idea into a <span className="lp-grad">live website</span>{" "}
              in minutes
            </h1>
            <p className="lp-sub">
              Describe what you want. Buildora designs, codes and previews a
              multi-page React website, then lets you download it as a ZIP.
              {user ? ` Welcome back, ${user.name.split(" ")[0]}.` : ""}
            </p>
            <form
              className="lp-prompt"
              onSubmit={(e) => {
                e.preventDefault();
                start();
              }}
            >
              <input
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="A dark SaaS landing page with pricing and FAQ..."
                aria-label="Describe your website"
              />
              <button className="lp-btn primary" type="submit">
                Build it <ArrowRight size={15} />
              </button>
            </form>
            <div className="lp-chips">
              {IDEAS.map((i) => (
                <button key={i} onClick={() => start(i)}>
                  {i}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="lp-section">
          <div className="lp-container">
            <h2>Everything you need to launch</h2>
            <p className="lp-lead">
              From the first prompt to a downloadable project.
            </p>
            <div className="lp-grid">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <article key={title} className="lp-card">
                  <span className="lp-icon">
                    <Icon size={20} />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="lp-section alt">
          <div className="lp-container">
            <h2>How it works</h2>
            <div className="lp-steps">
              {STEPS.map((s) => (
                <div key={s.n} className="lp-step">
                  <span className="lp-num">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="projects" className="lp-section">
          <div className="lp-container">
            <h2>Your recent projects</h2>
            <p className="lp-lead">
              Saved automatically in this browser. Open one to keep editing.
            </p>
            {projects.length === 0 ? (
              <div className="lp-empty">
                <FolderOpen size={28} />
                <p>No projects yet. Build your first website in a minute.</p>
                <a className="lp-btn primary" href="/app">
                  Start building <ArrowRight size={15} />
                </a>
              </div>
            ) : (
              <div className="lp-grid">
                {projects.map((p) => (
                  <article key={p.id} className="lp-card">
                    <h3>{p.name || "Untitled project"}</h3>
                    <p className="lp-muted">
                      {Object.keys(p.files || {}).length} files ·{" "}
                      {new Date(p.updated).toLocaleDateString()}
                    </p>
                    <div className="lp-row">
                      <a className="lp-btn primary sm" href={`/app?p=${p.id}`}>
                        Open <ArrowRight size={14} />
                      </a>
                      <button
                        className="lp-btn ghost sm"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => {
                          deleteProject(p.id);
                          setProjects(listProjects());
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="faq" className="lp-section alt">
          <div className="lp-container lp-faq">
            <h2>Frequently asked questions</h2>
            {FAQS.map((f, i) => (
              <div key={f.q} className={`lp-faq-item ${openFaq === i ? "open" : ""}`}>
                <button
                  aria-expanded={openFaq === i}
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                >
                  {f.q}
                  <ChevronDown size={18} />
                </button>
                {openFaq === i && <p>{f.a}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-container lp-cta">
            <h2>Ready to build your website?</h2>
            <p>It takes one sentence. No credit card, no setup.</p>
            <a className="lp-btn primary lg" href="/app">
              Start building free <ArrowRight size={16} />
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
