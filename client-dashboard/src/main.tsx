import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// Apply theme synchronously before first paint to avoid flash.
(function applyInitialTheme() {
  try {
    const stored = window.localStorage.getItem("theme");
    const pref = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const prefersDark =
      pref === "dark" ||
      (pref === "system" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    const resolved = prefersDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#0b1220" : "#f8fafc");
  } catch {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
