import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Console design-system fonts: Archivo (display), Inter (body), IBM Plex Mono
// (data). Imported before index.css so @font-face is registered when tokens
// reference the families.
import "@fontsource-variable/inter";
import "@fontsource-variable/archivo";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./index.css";
import { ThemeProvider } from "./lib/ThemeContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
