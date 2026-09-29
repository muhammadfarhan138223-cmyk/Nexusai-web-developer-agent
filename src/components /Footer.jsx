import { OWNER, SITE_NAME, SOCIALS } from "../site";

// Small inline icons so we don't depend on lucide-react having brand logos.
const ICONS = {
  twitter: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.9 2H22l-7.6 8.7L23 22h-6.9l-5.4-6.6L4.4 22H1.3l8.1-9.3L1 2h7.1l4.9 6.1L18.9 2zm-1.2 18h1.9L7.4 4H5.4l12.3 16z" />
    </svg>
  ),
  github: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.8 9.6.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1-1.5-1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.3 1.1 2.9.9.1-.7.3-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.5-1.4.1-2.8 0 0 .9-.3 2.9 1a10 10 0 0 1 5.3 0c2-1.3 2.9-1 2.9-1 .6 1.4.2 2.5.1 2.8.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .3.3.6.8.6 1.7v2.5c0 .3.2.6.7.5 3.9-1.3 6.8-5.1 6.8-9.6C22 6.6 17.5 2 12 2z" />
    </svg>
  ),
  linkedin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3V9zm7 0h3.8v1.7h.1c.5-.9 1.8-1.9 3.7-1.9 4 0 4.7 2.6 4.7 6V21h-4v-5.4c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V21h-4V9z" />
    </svg>
  ),
  instagram: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2c2.7 0 3.1 0 4.1.1 1.1 0 1.8.2 2.4.5.7.2 1.2.6 1.7 1.1.5.5.9 1 1.1 1.7.3.6.5 1.3.5 2.4.1 1 .1 1.4.1 4.1s0 3.1-.1 4.1c0 1.1-.2 1.8-.5 2.4-.2.7-.6 1.2-1.1 1.7-.5.5-1 .9-1.7 1.1-.6.3-1.3.5-2.4.5-1 .1-1.4.1-4.1.1s-3.1 0-4.1-.1c-1.1 0-1.8-.2-2.4-.5a4.6 4.6 0 0 1-1.7-1.1 4.6 4.6 0 0 1-1.1-1.7c-.3-.6-.5-1.3-.5-2.4C2 15.1 2 14.7 2 12s0-3.1.1-4.1c0-1.1.2-1.8.5-2.4.2-.7.6-1.2 1.1-1.7.5-.5 1-.9 1.7-1.1.6-.3 1.3-.5 2.4-.5C8.9 2 9.3 2 12 2zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zm5.2-8.4a1.2 1.2 0 1 1-2.3 0 1.2 1.2 0 0 1 2.3 0z" />
    </svg>
  ),
  youtube: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23 12s0-3.4-.4-5a2.9 2.9 0 0 0-2-2C18.9 4.6 12 4.6 12 4.6s-6.9 0-8.6.4a2.9 2.9 0 0 0-2 2C1 8.6 1 12 1 12s0 3.4.4 5a2.9 2.9 0 0 0 2 2c1.7.4 8.6.4 8.6.4s6.9 0 8.6-.4a2.9 2.9 0 0 0 2-2c.4-1.6.4-5 .4-5zM9.8 15.5v-7l6 3.5-6 3.5z" />
    </svg>
  )
};

export default function Footer() {
  const activeSocials = Object.entries(SOCIALS).filter(([, url]) => url);

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
          {activeSocials.length > 0 && (
            <div className="lp-socials">
              {activeSocials.map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={key}
                >
                  {ICONS[key]}
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h4>Product</h4>
          <a href="/app">Open builder</a>
          <a href="/#features">Features</a>
          <a href="/#how">How it works</a>
          <a href="/#projects">Recent projects</a>
        </div>
        <div>
          <h4>Company</h4>
          <a href="/about">About</a>
          <a href="/login">Log in</a>
          <a href="/#faq">FAQ</a>
        </div>
        <div>
          <h4>Legal</h4>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <a href="/cookies">Cookie Policy</a>
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
