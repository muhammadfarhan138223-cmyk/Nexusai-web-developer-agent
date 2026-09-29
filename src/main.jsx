import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import "./index.css";

const path = window.location.pathname.replace(/\/+$/, "") || "/";
const Page = path === "/app" ? App : path === "/login" ? Login : Landing;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
