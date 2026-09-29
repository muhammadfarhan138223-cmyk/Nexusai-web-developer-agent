import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { SITE_NAME } from "../site";
import { getUser, logoutUser } from "../store";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(getUser);

  const links = [
    ["Features", "/#features"],
    ["How it works", "/#how"],
    ["Recent projects", "/#projects"],
    ["FAQ", "/#faq"],
    ["About", "/about"]
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
              <button
                className="lp-btn ghost"
                onClick={() => {
                  logoutUser();
                  setUser(null);
                }}
              >
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
