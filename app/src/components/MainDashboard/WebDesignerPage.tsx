import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "../../lib/tauri";
import type { WebDesignerEvent, WebsiteFile } from "../../lib/types";

interface WebDesignerPageProps {
  root: string | null;
  clientSlug: string;
  clientName: string;
}

type Mode = "build" | "revamp";
type View = "build" | "edit";

type Niche = {
  id: string;
  label: string;
  color: string;
};

const NICHES: Niche[] = [
  { id: "dental", label: "Dental", color: "#3B82F6" },
  { id: "gym", label: "Gym / Fitness", color: "#F97316" },
  { id: "medspa", label: "Med Spa / Beauty", color: "#EC4899" },
  { id: "legal", label: "Legal", color: "#D97706" },
  { id: "realestate", label: "Real Estate", color: "#10B981" },
  { id: "homeservices", label: "Home Services", color: "#0EA5E9" },
  { id: "restaurant", label: "Restaurant", color: "#F59E0B" },
  { id: "custom", label: "Custom", color: "#a78bfa" },
];

const SECTIONS = [
  { id: "hero", label: "Hero" },
  { id: "services", label: "Services" },
  { id: "trust", label: "Trust signals" },
  { id: "testimonials", label: "Testimonials" },
  { id: "about", label: "About" },
  { id: "contact", label: "Contact" },
  { id: "footer", label: "Footer" },
];

function camelSlug(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (cleaned.length === 0) return "site";
  const [first, ...rest] = cleaned;
  return first + rest.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

function fmtWhen(unix: number): string {
  if (!unix) return "—";
  const d = new Date(unix * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildPrompt(args: {
  businessName: string;
  niche: string;
  city: string;
  phone: string;
  url: string;
  services: string;
  accent: string;
  fileBase: string;
}): string {
  const urlLine = args.url.trim() ? args.url.trim() : "none";
  const niceServices = args.services.trim()
    ? args.services.trim()
    : "(none provided — infer reasonable services for the niche)";
  return `You are a professional web developer building a high-converting landing page for a local business.

Client info:
- Business name: ${args.businessName}
- Type of business: ${args.niche}
- Location: ${args.city}
- Phone: ${args.phone}
- Existing website to reference (if any): ${urlLine}
- Key services they offer: ${niceServices}

Build a complete, modern, single-page website that includes:

1. HERO SECTION: compelling headline focused on the outcome they deliver (not just their name), subheadline, primary CTA button ("Book Free Consultation" or relevant CTA), background gradient or dark overlay

2. SERVICES SECTION: 3-4 service cards with icons, short descriptions, and benefits (not features)

3. WHY US / TRUST SECTION: 3 trust signals (years in business, satisfied clients, guarantee, etc.)

4. TESTIMONIALS: 3 placeholder testimonials with realistic names, ratings, and specific outcomes mentioned

5. ABOUT: brief paragraph in first person, friendly and local, 2-3 sentences max

6. CONTACT SECTION: contact form (name, email, phone, message), phone number, address, Google Maps embed placeholder

7. FOOTER: business name, quick links, social icons, copyright

Design requirements:
- Dark modern aesthetic (dark background #0a0a0a or similar)
- Primary accent color: ${args.accent}
- Mobile responsive (use flexbox/grid)
- Clean Inter or Poppins font via Google Fonts
- Subtle animations on scroll if possible
- Professional, not corporate

Save as: ${args.fileBase}-website.html

Make it look like it cost $5,000. Every section should have real copy, not "Lorem ipsum".

TECHNICAL OUTPUT REQUIREMENTS:
- Wrap each of the seven numbered sections above in a top-level element with a matching data-section attribute. Use these exact values:
    <section data-section="hero">...</section>
    <section data-section="services">...</section>
    <section data-section="trust">...</section>
    <section data-section="testimonials">...</section>
    <section data-section="about">...</section>
    <section data-section="contact">...</section>
    <footer data-section="footer">...</footer>
- Output the COMPLETE HTML in a single fenced code block tagged \`\`\`html. Do not write any commentary outside the code block. The app will write the file.`;
}

function revampPrompt(args: {
  businessName: string;
  url: string;
  niche: string;
  city: string;
  accent: string;
  fileBase: string;
}): string {
  return `I need you to rebuild this local business website from scratch.

Business: ${args.businessName}
Current site URL: ${args.url}
Niche: ${args.niche}
City: ${args.city}

Step 1: Scrape their current website for all real information (business name, actual services, real phone number, address, hours, any testimonials).

Step 2: Build a brand new single-page website using that real information. Do NOT use their old design. Build something completely modern and premium.

Follow all the same design requirements as a professional web build:
- Dark modern design, mobile responsive
- Primary accent color: ${args.accent}
- Hero with strong headline and CTA
- Services section, about, testimonials, contact
- Real copy throughout, zero placeholders

Save as: ${args.fileBase}-revamp.html

This revamp should look like a $5,000 website next to their current site.

TECHNICAL OUTPUT REQUIREMENTS:
- Wrap the seven core sections (hero, services, trust, testimonials, about, contact, footer) in top-level elements with matching data-section attributes:
    <section data-section="hero">...</section>
    <section data-section="services">...</section>
    <section data-section="trust">...</section>
    <section data-section="testimonials">...</section>
    <section data-section="about">...</section>
    <section data-section="contact">...</section>
    <footer data-section="footer">...</footer>
- Output the COMPLETE HTML in a single fenced code block tagged \`\`\`html. No commentary outside the code block. The app handles the file save.`;
}

// Tiny script injected into the preview iframe so the user can click sections
// to scope the next chat edit. Picks up [data-section] elements, adds
// hover/selected outlines, postMessages the chosen id up to the parent.
const PICK_SCRIPT = `
(function() {
  if (window.__wdPickInstalled) return;
  window.__wdPickInstalled = true;
  var STYLE = document.createElement('style');
  STYLE.textContent =
    '[data-section]{outline:1px dashed transparent;outline-offset:6px;transition:outline-color .12s,box-shadow .12s;cursor:pointer;position:relative}' +
    '[data-section]:hover{outline-color:rgba(94,234,212,.45)}' +
    '[data-section].__wd-selected{outline:2px solid #5eead4;outline-offset:6px;box-shadow:0 0 30px -10px rgba(94,234,212,.5)}' +
    '[data-section]::before{content:attr(data-section);position:absolute;top:6px;left:6px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#5eead4;background:rgba(10,12,18,.85);padding:3px 8px;border-radius:3px;opacity:0;transition:opacity .12s;pointer-events:none;z-index:50}' +
    '[data-section]:hover::before,[data-section].__wd-selected::before{opacity:1}';
  document.head.appendChild(STYLE);
  document.addEventListener('click', function(e) {
    var el = e.target;
    while (el && el !== document.body && !(el.dataset && el.dataset.section)) {
      el = el.parentElement;
    }
    if (!el || el === document.body) return;
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll('.__wd-selected').forEach(function(n){ n.classList.remove('__wd-selected'); });
    el.classList.add('__wd-selected');
    parent.postMessage({ source: 'wd-canvas', kind: 'section-selected', section: el.dataset.section }, '*');
  }, true);
  document.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(e){ e.preventDefault(); }); });
})();
`;

function injectPickScript(html: string): string {
  const tag = `<script>${PICK_SCRIPT}</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tag}</body>`);
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${tag}</html>`);
  return html + tag;
}

export function WebDesignerPage({ root, clientSlug, clientName }: WebDesignerPageProps) {
  const [view, setView] = useState<View>("build");
  const [mode, setMode] = useState<Mode>("build");

  // Form fields
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [url, setUrl] = useState("");
  const [services, setServices] = useState("");
  const [nicheId, setNicheId] = useState<string>("dental");
  const [accent, setAccent] = useState<string>(NICHES[0].color);

  // Run state
  const [running, setRunning] = useState(false);
  const [streamLog, setStreamLog] = useState<string>("");
  const [runError, setRunError] = useState<string | null>(null);
  const runIdRef = useRef<string>("");

  // Active file in edit view
  const [activeFile, setActiveFile] = useState<WebsiteFile | null>(null);
  const [activeHtml, setActiveHtml] = useState<string>("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Recents
  const [recents, setRecents] = useState<WebsiteFile[]>([]);

  // Edit-mode state
  type ChatTurn = {
    id: string;
    role: "user" | "agent" | "system";
    body: string;
    scope: string | null;
    at: number;
  };
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [composer, setComposer] = useState("");
  const [scope, setScope] = useState<string | null>(null);
  const [polish, setPolish] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const niche = useMemo(() => NICHES.find((n) => n.id === nicheId) ?? NICHES[0], [nicheId]);

  // Snap accent to the niche's default color when the niche changes — only if
  // the user hasn't customized it from a previous niche pick.
  const lastSnappedRef = useRef<string>(NICHES[0].color);
  useEffect(() => {
    if (accent === lastSnappedRef.current) {
      setAccent(niche.color);
      lastSnappedRef.current = niche.color;
    } else {
      lastSnappedRef.current = niche.color;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nicheId]);

  // Load recents on mount + when client changes
  const refreshRecents = useCallback(async () => {
    if (!root) return;
    try {
      const next = await api.listWebDesignerFiles(root, clientSlug);
      setRecents(next);
    } catch (e) {
      console.warn("listWebDesignerFiles failed:", e);
    }
  }, [root, clientSlug]);

  useEffect(() => {
    void refreshRecents();
  }, [refreshRecents]);

  // Listen to backend stream
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await api.onWebDesignerStream((evt: WebDesignerEvent) => {
        if (evt.id !== runIdRef.current) return;
        if (evt.kind === "started") {
          setStreamLog("▸ Web Designer running…\n");
        } else if (evt.kind === "delta") {
          setStreamLog((prev) => prev + evt.text);
        } else if (evt.kind === "done") {
          setRunning(false);
          if (evt.ok && evt.path) {
            void onRunComplete(evt.path);
          } else if (evt.message) {
            setRunError(evt.message);
          }
        } else if (evt.kind === "error") {
          setRunning(false);
          setRunError(evt.message);
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for section-selected postMessage from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const data = e.data;
      if (data && data.source === "wd-canvas" && data.kind === "section-selected") {
        setScope(typeof data.section === "string" ? data.section : null);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, running]);

  const loadFile = useCallback(async (file: WebsiteFile) => {
    setActiveFile(file);
    try {
      const html = await api.readWebDesignerFile(file.path);
      setActiveHtml(html);
    } catch (e) {
      setRunError(String(e));
    }
  }, []);

  const onRunComplete = useCallback(
    async (path: string) => {
      await refreshRecents();
      // Find the file we just wrote in the refreshed recents list
      try {
        const list = await api.listWebDesignerFiles(root!, clientSlug);
        setRecents(list);
        const just = list.find((f) => f.path === path);
        if (just) {
          await loadFile(just);
          setTurns([
            {
              id: `t-${Date.now()}`,
              role: "system",
              body: `Site built. Click a section in the preview to scope an edit, or just describe a change.`,
              scope: null,
              at: Date.now(),
            },
          ]);
          setScope(null);
          setView("edit");
        }
      } catch (e) {
        console.warn("post-run load failed", e);
      }
    },
    [refreshRecents, root, clientSlug, loadFile],
  );

  const onSubmitBuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!root) {
      setRunError("No media-buying folder configured. Pick the folder from Settings first.");
      return;
    }
    if (!businessName.trim()) {
      setRunError("Business name is required.");
      return;
    }
    if (mode === "revamp" && !url.trim()) {
      setRunError("URL is required for revamps.");
      return;
    }
    setRunError(null);
    setStreamLog("");
    const fileBase = camelSlug(businessName);
    const id = `wd-${Date.now().toString(36)}`;
    runIdRef.current = id;
    setRunning(true);
    const prompt =
      mode === "build"
        ? buildPrompt({
            businessName: businessName.trim(),
            niche: niche.label,
            city: city.trim(),
            phone: phone.trim(),
            url: url.trim(),
            services: services.trim(),
            accent: accent.toUpperCase(),
            fileBase,
          })
        : revampPrompt({
            businessName: businessName.trim(),
            url: url.trim(),
            niche: niche.label,
            city: city.trim(),
            accent: accent.toUpperCase(),
            fileBase,
          });
    try {
      await api.runWebDesigner(id, root, clientSlug, mode, prompt, fileBase);
    } catch (err) {
      setRunning(false);
      setRunError(String(err));
    }
  };

  const onSendEdit = async () => {
    if (!root || !activeFile) return;
    const body = composer.trim();
    if (!body) return;
    setRunError(null);
    setComposer("");
    const id = `wd-${Date.now().toString(36)}`;
    runIdRef.current = id;
    setStreamLog("");
    setRunning(true);
    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      body,
      scope,
      at: Date.now(),
    };
    setTurns((prev) => [...prev, userTurn]);
    const scopeForCall = scope;
    const polishForCall = polish;
    setPolish(false); // resets after the turn — opt-in only
    try {
      await api.editWebDesigner(
        id,
        root,
        clientSlug,
        activeFile.path,
        body,
        scopeForCall,
        polishForCall,
      );
      // refresh HTML
      const html = await api.readWebDesignerFile(activeFile.path);
      setActiveHtml(html);
      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "agent",
          body:
            "Updated " +
            (scopeForCall ? `the ${scopeForCall} section.` : "the page.") +
            " Preview reloaded.",
          scope: scopeForCall,
          at: Date.now(),
        },
      ]);
    } catch (e) {
      setRunError(String(e));
      setTurns((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "system",
          body: `Edit failed: ${String(e)}`,
          scope: scopeForCall,
          at: Date.now(),
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  const onPickRecent = async (f: WebsiteFile) => {
    await loadFile(f);
    setTurns([]);
    setScope(null);
    setView("edit");
  };

  const onOpenInBrowser = async () => {
    if (!activeFile) return;
    try {
      await openPath(activeFile.path);
    } catch (e) {
      console.warn(e);
    }
  };

  const onRevealFile = async () => {
    if (!activeFile) return;
    try {
      await revealItemInDir(activeFile.path);
    } catch (e) {
      console.warn(e);
    }
  };

  const onCopyHtml = async () => {
    if (!activeHtml) return;
    try {
      await navigator.clipboard.writeText(activeHtml);
    } catch (e) {
      console.warn(e);
    }
  };

  const previewSrcDoc = useMemo(() => {
    if (!activeHtml) return "";
    return injectPickScript(activeHtml);
  }, [activeHtml]);

  // ─────────────────────────── BUILD VIEW ───────────────────────────
  if (view === "build") {
    return (
      <div className="hml-content">
        <section className="hml-page-header">
          <div>
            <div className="hml-page-eyebrow">
              <span className="hml-eyebrow-dot" />
              Web Designer · {clientName}
            </div>
            <h1 className="hml-page-title">What are we building today?</h1>
            <div className="hml-page-subtitle">
              Pick a mode below. The agent generates a complete responsive landing
              page using the info you provide — saved straight to{" "}
              <code style={{ fontFamily: "var(--hml-font-mono)", color: "var(--hml-accent)" }}>
                vault/Clients/{clientName}/website/
              </code>.
            </div>
          </div>
        </section>

        <div className="wd-root">

        <div className="wd-tiles md-reveal md-reveal-3">
          <button
            type="button"
            className={`wd-tile${mode === "build" ? " wd-tile-active" : ""}`}
            onClick={() => setMode("build")}
          >
            <div className="wd-tile-icon">◆</div>
            <div className="wd-tile-name">Build a new site</div>
            <div className="wd-tile-cmd">/build-site</div>
            <div className="wd-tile-desc">
              Generate a complete landing page from business name, niche, city, phone, and
              services. Hero, trust, testimonials, contact — all included.
            </div>
            <div className="wd-tile-meta">
              <span className="wd-meta-dur">~90s</span> · single HTML file
            </div>
          </button>
          <button
            type="button"
            className={`wd-tile${mode === "revamp" ? " wd-tile-active" : ""}`}
            onClick={() => setMode("revamp")}
          >
            <div className="wd-tile-icon">↻</div>
            <div className="wd-tile-name">Revamp an existing site</div>
            <div className="wd-tile-cmd">/revamp-site</div>
            <div className="wd-tile-desc">
              Paste a URL of an ugly site. The agent scrapes their real info, then rebuilds
              it modern. Perfect for outreach mockups.
            </div>
            <div className="wd-tile-meta">
              <span className="wd-meta-dur">~2 min</span> · scrape + rebuild
            </div>
          </button>
        </div>

        <form className="wd-form-card md-reveal md-reveal-4" onSubmit={onSubmitBuild}>
          <div className="wd-form-head">
            <h2>{mode === "build" ? "Build site" : "Revamp site"}</h2>
            <span className="wd-form-cmd">{mode === "build" ? "/build-site" : "/revamp-site"}</span>
            <span className="wd-form-desc">
              Active client: <strong>{clientName}</strong>
            </span>
          </div>

          <div className="wd-section">
            <div className="wd-section-label">Business</div>
            <div className="wd-field-row">
              <label className="wd-field">
                <span className="wd-label">Business name</span>
                <input
                  type="text"
                  className="wd-input"
                  placeholder="Miami Smiles Dental"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  disabled={running}
                />
              </label>
              <label className="wd-field">
                <span className="wd-label">
                  URL{" "}
                  <span className="wd-hint">{mode === "revamp" ? "required" : "optional"}</span>
                </span>
                <input
                  type="url"
                  className="wd-input"
                  placeholder="theirdomain.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={running}
                />
              </label>
            </div>
            <div className="wd-field-row">
              <label className="wd-field">
                <span className="wd-label">City, State</span>
                <input
                  type="text"
                  className="wd-input"
                  placeholder="Miami, FL"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={running}
                />
              </label>
              {mode === "build" && (
                <label className="wd-field">
                  <span className="wd-label">Phone</span>
                  <input
                    type="text"
                    className="wd-input"
                    placeholder="(305) 555-0100"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={running}
                  />
                </label>
              )}
            </div>
            {mode === "build" && (
              <label className="wd-field" style={{ marginTop: 12 }}>
                <span className="wd-label">
                  Key services <span className="wd-hint">one per line</span>
                </span>
                <textarea
                  className="wd-input wd-textarea"
                  rows={4}
                  placeholder={"Cosmetic dentistry\nFamily care\nEmergency visits\nTeeth whitening"}
                  value={services}
                  onChange={(e) => setServices(e.target.value)}
                  disabled={running}
                />
              </label>
            )}
          </div>

          <div className="wd-section">
            <div className="wd-section-label">Niche · default palette</div>
            <div className="wd-pills">
              {NICHES.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`wd-pill${nicheId === n.id ? " wd-pill-active" : ""}`}
                  onClick={() => setNicheId(n.id)}
                  disabled={running}
                >
                  <span className="wd-pill-dot" style={{ background: n.color }} />
                  {n.label}
                </button>
              ))}
            </div>
          </div>

          <div className="wd-section">
            <div className="wd-section-label">Accent color</div>
            <div className="wd-color-row">
              <input
                type="color"
                className="wd-color-wheel"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                disabled={running}
                aria-label="Pick accent color"
              />
              <input
                type="text"
                className="wd-input wd-hex-input"
                value={accent.toUpperCase()}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) {
                    setAccent(v.startsWith("#") ? v : `#${v}`);
                  }
                }}
                disabled={running}
                spellCheck={false}
                aria-label="Hex value"
              />
              <span className="wd-accent-preview" style={{ background: accent }} />
              <span className="wd-hint" style={{ flex: 1 }}>
                Click the wheel or paste a hex value. Niche pill snaps the default.
              </span>
            </div>
          </div>

          {runError && <div className="wd-error">{runError}</div>}

          <div className="wd-actions">
            <button type="submit" className="wd-primary" disabled={running || !root}>
              {running
                ? mode === "build"
                  ? "Building site…"
                  : "Revamping…"
                : mode === "build"
                  ? "Build site →"
                  : "Revamp site →"}
            </button>
            <button
              type="button"
              className="wd-ghost"
              onClick={async () => {
                if (!root) return;
                try {
                  const dir = await api.webDesignerDir(root, clientSlug);
                  await openPath(dir);
                } catch (e) {
                  console.warn(e);
                }
              }}
              disabled={!root}
            >
              Open websites folder
            </button>
          </div>

          {!root && (
            <div className="wd-warn">
              No media-buying folder configured. Pick the folder from Settings (⚙) first.
            </div>
          )}

          {running && (
            <div className="wd-stream">
              <div className="wd-stream-head">▸ LIVE OUTPUT</div>
              <pre className="wd-stream-body">{streamLog || "Booting Claude…"}</pre>
            </div>
          )}
        </form>

        <div className="wd-recents md-reveal md-reveal-5">
          <div className="wd-recents-head">
            <h3>Recent sites</h3>
            <span className="wd-recents-info">
              {recents.length === 0
                ? "No sites yet — build one above."
                : `${recents.length} file${recents.length === 1 ? "" : "s"} · ${clientName}/websites/`}
            </span>
          </div>
          {recents.length > 0 && (
            <div className="wd-recents-list">
              {recents.map((f) => (
                <div key={f.path} className="wd-recents-row">
                  <span className={`wd-recents-tag wd-tag-${f.mode}`}>{f.mode}</span>
                  <span className="wd-recents-name" title={f.path}>
                    {f.name}
                  </span>
                  <span className="wd-recents-time">{fmtWhen(f.modified_unix)}</span>
                  <div className="wd-recents-actions">
                    <button
                      type="button"
                      className="wd-link"
                      onClick={() => void onPickRecent(f)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="wd-link"
                      onClick={() => void openPath(f.path)}
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    );
  }

  // ─────────────────────────── EDIT VIEW ───────────────────────────
  return (
    <div className="wd-edit-root">
      <div className="wd-edit-topbar">
        <button type="button" className="wd-back" onClick={() => setView("build")}>
          ‹ Back to Web Designer
        </button>
        <span className="wd-edit-file">
          ▸ <span className="wd-edit-file-name">{activeFile?.name ?? "—"}</span>
        </span>
        <div className="wd-edit-tools">
          <button type="button" className="wd-link" onClick={() => void onOpenInBrowser()}>
            Open in browser
          </button>
          <button type="button" className="wd-link" onClick={() => void onRevealFile()}>
            Show in folder
          </button>
          <button type="button" className="wd-link" onClick={() => void onCopyHtml()}>
            Copy HTML
          </button>
        </div>
      </div>

      <div className="wd-edit-shell">
        {/* CHAT COLUMN */}
        <div className="wd-chat-col">
          <div className="wd-outline">
            <div className="wd-outline-label">Sections · click in preview to scope</div>
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`wd-outline-row${scope === s.id ? " wd-outline-active" : ""}`}
                onClick={() => setScope(scope === s.id ? null : s.id)}
              >
                <span className="wd-outline-marker" />
                <span className="wd-outline-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="wd-outline-name">{s.label}</span>
              </button>
            ))}
          </div>

          <div ref={scrollRef} className="wd-chat-scroll">
            {turns.length === 0 && (
              <div className="wd-chat-empty">
                Tell the agent what to change. Click a section in the preview to scope the
                edit to just that part of the page.
              </div>
            )}
            {turns.map((t) => (
              <div key={t.id} className={`wd-turn wd-turn-${t.role}`}>
                <div className="wd-turn-meta">
                  <span className={`wd-turn-who wd-turn-who-${t.role}`}>
                    {t.role === "user" ? "Sir" : t.role === "agent" ? "Web Designer" : "System"}
                  </span>
                  {t.scope && <span className="wd-turn-scope">▸ {t.scope.toUpperCase()}</span>}
                  <span className="wd-turn-time">
                    {new Date(t.at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="wd-turn-body">{t.body}</div>
              </div>
            ))}
            {running && (
              <div className="wd-turn wd-turn-agent wd-turn-streaming">
                <div className="wd-turn-meta">
                  <span className="wd-turn-who wd-turn-who-agent">Web Designer</span>
                  <span className="wd-turn-time">streaming…</span>
                </div>
                <div className="wd-turn-body wd-turn-body-stream">{streamLog || "Thinking…"}</div>
              </div>
            )}
            {runError && <div className="wd-error" style={{ marginTop: 8 }}>{runError}</div>}
          </div>

          <div className="wd-composer">
            {scope && (
              <div className="wd-target-chip">
                <span className="wd-target-label">EDITING →</span>
                <span>{scope}</span>
                <button
                  type="button"
                  className="wd-target-x"
                  onClick={() => setScope(null)}
                  aria-label="Clear scope"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="wd-composer-row">
              <button
                type="button"
                className={`wd-skill-toggle${polish ? " wd-skill-on" : ""}`}
                onClick={() => setPolish((v) => !v)}
                disabled={running}
                title="Opt in to design-polish guidance for this turn only"
              >
                <span className="wd-skill-dot" />
                + Design polish
                {polish && <span className="wd-skill-flag">ON</span>}
              </button>
            </div>
            <div className="wd-composer-box">
              <textarea
                rows={3}
                placeholder={
                  scope
                    ? `Change the ${scope} section…`
                    : "What should change? e.g. 'punchier hero headline' · 'swap accent to coral'"
                }
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void onSendEdit();
                  }
                }}
                disabled={running}
              />
              <div className="wd-composer-actions">
                <span className="wd-composer-hint">⌘↵ to send</span>
                <button
                  type="button"
                  className="wd-primary wd-primary-small"
                  onClick={() => void onSendEdit()}
                  disabled={running || !composer.trim()}
                >
                  {running ? "Editing…" : "Send →"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* PREVIEW COLUMN */}
        <div className="wd-preview-col">
          <div className="wd-preview-frame">
            {activeHtml ? (
              <iframe
                ref={iframeRef}
                title="Website preview"
                srcDoc={previewSrcDoc}
                sandbox="allow-scripts allow-same-origin"
                className="wd-preview-iframe"
              />
            ) : (
              <div className="wd-preview-empty">No file loaded.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
