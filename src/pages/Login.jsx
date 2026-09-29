import { useState } from "react";
import "../landing.css";
import { useSeo } from "../seo";
import { getUser, loginUser } from "../store";

export default function Login() {
  useSeo("Log in - Buildora", "Log in to Buildora to save your projects.", {
    noindex: true,
    path: "/login"
  });
  const existing = getUser();
  const [name, setName] = useState(existing?.name || "");
  const [email, setEmail] = useState(existing?.email || "");
  const [error, setError] = useState("");

  const next = new URLSearchParams(window.location.search).get("next") || "/app";

  const submit = (e) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Please enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Please enter a valid email.");
    loginUser(name, email);
    window.location.href = next.startsWith("/") ? next : "/app";
  };

  return (
    <div className="lp lp-auth">
      <div className="lp-glow" aria-hidden="true" />
      <form className="lp-auth-card" onSubmit={submit}>
        <a className="lp-logo" href="/">
          <span className="lp-logo-mark">B</span>
          <span>Buildora</span>
        </a>
        <h1>Welcome to Buildora</h1>
        <p className="lp-muted">Log in to keep your projects and profile.</p>

        <label htmlFor="name">Your name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />

        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

        {error && <div className="lp-error" role="alert">{error}</div>}

        <button className="lp-btn primary lg" type="submit">Continue</button>
        <a className="lp-btn ghost" href="/app">Continue as guest</a>
        <small className="lp-muted">
          Your profile and projects are stored in this browser only.
        </small>
      </form>
    </div>
  );
      }
