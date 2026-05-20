/**
 * OutreachSequencePage — guided cold-call campaign wizard.
 *
 *   1. Scrape     — run lead-scraper, capture the CSV
 *   2. Cold Call  — every lead on one page; click "Booked" on the ones that
 *                   pick up and agree to a discovery, the lead gets promoted
 *                   to a scheduled prospect with their info pre-filled. Others
 *                   stay ephemeral and disappear when the session ends.
 *   3. Websites   — build revamp HTML only for the leads that booked
 *   4. Summary    — review what got booked + sites built
 *
 * The DM workflow used to live here as a step; it now has its own page
 * (OutreachDmsPage) reachable from a tab on the OutreachHub. Cold calling is
 * the main path; DMs are a side-channel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "../../lib/tauri";
import type {
  ProspectFile,
  ScraperEvent,
  WebDesignerEvent,
} from "../../lib/types";
import type { ProspectStatus } from "../../lib/navigation";
import {
  IconArrowRight,
  IconChevronRight,
  IconLayout,
  IconPhone,
  IconTarget,
} from "../icons";

type Step = "scrape" | "call" | "mockup" | "summary";

interface CsvRow {
  raw: Record<string, string>;
  businessName: string;
  phone: string;
  website: string;
  address: string;
  rating: string;
  reviews: string;
  runningAds: string;
  facebook: string;
}

type CallDisposition = "pending" | "booked" | "no-answer" | "not-interested";

interface CallRecord {
  rowKey: string;
  disposition: CallDisposition;
  prospectSlug?: string;
  contactName?: string;
  contactEmail?: string;
  scheduledAt?: string;
  notes?: string;
}

interface MockupRecord {
  rowKey: string;
  businessName: string;
  prospectSlug: string;
  path: string;
  mode: "build" | "revamp";
  builtAt: number;
}

interface OutreachSequencePageProps {
  root: string | null;
  onExit: () => void;
}

const NICHE_COLORS: Record<string, string> = {
  dental: "#3B82F6",
  dentist: "#3B82F6",
  dentists: "#3B82F6",
  gym: "#F97316",
  fitness: "#F97316",
  medspa: "#EC4899",
  spa: "#EC4899",
  legal: "#D97706",
  lawyer: "#D97706",
  realestate: "#10B981",
  hvac: "#0EA5E9",
  homeservices: "#0EA5E9",
  restaurant: "#F59E0B",
  junk: "#10B981",
};

function colorForNiche(niche: string): string {
  const k = niche.toLowerCase().replace(/[^a-z]/g, "");
  for (const key of Object.keys(NICHE_COLORS)) {
    if (k.includes(key)) return NICHE_COLORS[key];
  }
  return "#a78bfa";
}

function slugify(name: string): string {
  const lower = name.trim().toLowerCase();
  let out = "";
  let prevDash = false;
  for (const ch of lower) {
    if (/[a-z0-9]/.test(ch)) {
      out += ch;
      prevDash = false;
    } else if (!prevDash && out.length > 0) {
      out += "-";
      prevDash = true;
    }
  }
  if (out.endsWith("-")) out = out.slice(0, -1);
  return out || "prospect";
}

function parseCsv(body: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      current.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  const cleaned = rows.filter((r) => r.some((c) => c.trim().length > 0));
  if (cleaned.length === 0) return { headers: [], rows: [] };
  const headers = cleaned[0].map((h) => h.trim());
  const records: Record<string, string>[] = [];
  for (let r = 1; r < cleaned.length; r++) {
    const rec: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      rec[headers[c]] = (cleaned[r][c] ?? "").trim();
    }
    records.push(rec);
  }
  return { headers, rows: records };
}

function toCsvRow(raw: Record<string, string>): CsvRow {
  return {
    raw,
    businessName: raw["Business Name"] ?? raw["business_name"] ?? "",
    phone: raw["Phone"] ?? "",
    website: raw["Website"] ?? "",
    address: raw["Address"] ?? "",
    rating: raw["Rating"] ?? "",
    reviews: raw["Reviews"] ?? "",
    runningAds: raw["Running Ads"] ?? "",
    facebook: raw["Facebook Page"] ?? "",
  };
}

function parseFilenameMeta(name: string): { niche: string; city: string; date: string } {
  const stem = name.replace(/\.csv$/i, "");
  const parts = stem.split("-");
  if (parts.length < 4) return { niche: "", city: stem, date: "" };
  const date = parts.slice(-3).join("-").match(/^\d{4}-\d{2}-\d{2}$/)
    ? parts.slice(-3).join("-")
    : "";
  const remaining = date ? parts.slice(0, -3) : parts;
  if (remaining.length >= 2) {
    const state = remaining[1].toUpperCase();
    const city = remaining[0].replace(/\b\w/g, (m) => m.toUpperCase());
    const niche = remaining.slice(2).join(" ");
    return { niche, city: `${city}, ${state}`, date };
  }
  return { niche: "", city: stem, date };
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

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

export function OutreachSequencePage({ root, onExit }: OutreachSequencePageProps) {
  const [step, setStep] = useState<Step>("scrape");

  // Campaign state ─────────────────────────────────────────
  const [csvFile, setCsvFile] = useState<ProspectFile | null>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvMeta, setCsvMeta] = useState<{ niche: string; city: string; date: string }>({
    niche: "",
    city: "",
    date: "",
  });
  const [calls, setCalls] = useState<Record<string, CallRecord>>({});
  const [mockups, setMockups] = useState<MockupRecord[]>([]);

  // History (so user can resume an existing campaign)
  const [csvHistory, setCsvHistory] = useState<ProspectFile[]>([]);
  const refreshHistory = useCallback(async () => {
    if (!root) return;
    try {
      const list = await api.listProspectFiles(root);
      setCsvHistory(list);
    } catch (e) {
      console.warn("listProspectFiles failed:", e);
    }
  }, [root]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const loadCsv = useCallback(async (file: ProspectFile) => {
    try {
      const body = await api.readDmFile(file.path);
      const parsed = parseCsv(body);
      setCsvFile(file);
      setCsvRows(parsed.rows.map(toCsvRow));
      setCsvMeta(parseFilenameMeta(file.name));
      setCalls({});
      setMockups([]);
    } catch (e) {
      console.warn("loadCsv failed:", e);
    }
  }, []);

  // ─── Step 1: Scrape ───────────────────────────────────
  const [scrapeNiche, setScrapeNiche] = useState("");
  const [scrapeCity, setScrapeCity] = useState("");
  const [scrapeRunning, setScrapeRunning] = useState(false);
  const [scrapeLog, setScrapeLog] = useState<string[]>([]);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const scrapeIdRef = useRef<string>("");
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await api.onLeadScraperStream((evt: ScraperEvent) => {
        if (evt.id !== scrapeIdRef.current) return;
        if (evt.kind === "started") {
          setScrapeLog((prev) => [...prev, "▸ Scraper started…"]);
        } else if (evt.kind === "line") {
          setScrapeLog((prev) => [...prev, evt.text]);
        } else if (evt.kind === "done") {
          setScrapeRunning(false);
          setScrapeLog((prev) => [
            ...prev,
            "",
            evt.exit_code === 0
              ? "✓ Scraper finished successfully."
              : `✗ Scraper exited with code ${evt.exit_code}.`,
          ]);
          if (evt.csv_path && evt.exit_code === 0) {
            void (async () => {
              await refreshHistory();
              if (!root) return;
              try {
                const list = await api.listProspectFiles(root);
                setCsvHistory(list);
                const fresh = list.find((f) => f.path === evt.csv_path);
                if (fresh) {
                  await loadCsv(fresh);
                  setStep("call");
                }
              } catch (e) {
                console.warn("post-scrape load failed", e);
              }
            })();
          }
        } else if (evt.kind === "error") {
          setScrapeError(evt.message);
          setScrapeRunning(false);
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [root, refreshHistory, loadCsv]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [scrapeLog.length]);

  const onRunScrape = async () => {
    if (!root) {
      setScrapeError("No media-buying folder configured. Pick the folder in Settings first.");
      return;
    }
    const n = scrapeNiche.trim();
    const c = scrapeCity.trim();
    if (!n || !c) {
      setScrapeError("Both niche and city are required.");
      return;
    }
    setScrapeError(null);
    setScrapeLog([]);
    setScrapeRunning(true);
    const id = `seq-scrape-${Date.now().toString(36)}`;
    scrapeIdRef.current = id;
    try {
      await api.runLeadScraper(id, root, n, c);
    } catch (err) {
      setScrapeError(String(err));
      setScrapeRunning(false);
    }
  };

  // ─── Step 2: Cold Call ────────────────────────────────
  const setDisposition = (rowKey: string, disposition: CallDisposition) => {
    setCalls((prev) => {
      const existing = prev[rowKey] ?? { rowKey, disposition: "pending" };
      return { ...prev, [rowKey]: { ...existing, disposition } };
    });
  };

  const bookProspect = async (
    row: CsvRow,
    fields: {
      contactName: string;
      contactEmail: string;
      scheduledAt: string;
      notes: string;
    },
  ) => {
    if (!root) {
      throw new Error("No media-buying folder configured. Pick one in Settings.");
    }
    const scheduledRfc = fields.scheduledAt
      ? new Date(fields.scheduledAt).toISOString()
      : null;
    const created = await api.addProspect(root, {
      name: row.businessName,
      niche: csvMeta.niche || null,
      url: row.website || null,
      contactName: fields.contactName.trim() || null,
      contactPhone: row.phone || null,
      contactEmail: fields.contactEmail.trim() || null,
      scheduledAt: scheduledRfc,
      status: "scheduled" as ProspectStatus,
      notes: fields.notes.trim() || null,
    });
    setCalls((prev) => ({
      ...prev,
      [row.businessName]: {
        rowKey: row.businessName,
        disposition: "booked",
        prospectSlug: created?.slug,
        contactName: fields.contactName,
        contactEmail: fields.contactEmail,
        scheduledAt: fields.scheduledAt,
        notes: fields.notes,
      },
    }));
  };

  const bookedCount = useMemo(
    () => Object.values(calls).filter((c) => c.disposition === "booked").length,
    [calls],
  );
  const bookedRows = useMemo(
    () =>
      csvRows.filter(
        (r) => calls[r.businessName]?.disposition === "booked",
      ),
    [csvRows, calls],
  );

  // ─── Step 3: Mockups ──────────────────────────────────
  const [mockupRowKey, setMockupRowKey] = useState<string | null>(null);
  const [mockupMode, setMockupMode] = useState<"build" | "revamp">("revamp");
  const [mockupAccent, setMockupAccent] = useState<string>("#5eead4");
  const [mockupRunning, setMockupRunning] = useState(false);
  const [mockupLog, setMockupLog] = useState<string>("");
  const [mockupError, setMockupError] = useState<string | null>(null);
  const mockupIdRef = useRef<string>("");
  const pendingMockupRef = useRef<{
    rowKey: string;
    businessName: string;
    prospectSlug: string;
    mode: "build" | "revamp";
  } | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await api.onWebDesignerStream((evt: WebDesignerEvent) => {
        if (evt.id !== mockupIdRef.current) return;
        if (evt.kind === "started") {
          setMockupLog("▸ Web Designer running…\n");
        } else if (evt.kind === "delta") {
          setMockupLog((prev) => prev + evt.text);
        } else if (evt.kind === "done") {
          setMockupRunning(false);
          if (evt.ok && evt.path && pendingMockupRef.current) {
            const p = pendingMockupRef.current;
            setMockups((prev) => {
              const filtered = prev.filter((m) => m.rowKey !== p.rowKey);
              return [
                ...filtered,
                {
                  rowKey: p.rowKey,
                  businessName: p.businessName,
                  prospectSlug: p.prospectSlug,
                  path: evt.path!,
                  mode: p.mode,
                  builtAt: Math.floor(Date.now() / 1000),
                },
              ];
            });
            setMockupRowKey(null);
          } else if (evt.message) {
            setMockupError(evt.message);
          }
        } else if (evt.kind === "error") {
          setMockupRunning(false);
          setMockupError(evt.message);
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const onBuildMockup = async (row: CsvRow) => {
    if (!root || !row.businessName) return;
    setMockupError(null);
    setMockupLog("");
    const rowKey = row.businessName;
    // Booked leads already have a prospect slug from the call step. Fall back
    // to a fresh promote if for some reason that's missing.
    let prospectSlug = calls[rowKey]?.prospectSlug ?? slugify(row.businessName);
    if (!calls[rowKey]?.prospectSlug) {
      try {
        const created = await api.promoteLeadToProspect(root, {
          name: row.businessName,
          niche: csvMeta.niche || null,
          url: row.website || null,
        });
        if (created?.slug) prospectSlug = created.slug;
      } catch (e) {
        console.warn("promoteLeadToProspect failed, using local slug:", e);
      }
    }

    const mode = row.website ? "revamp" : "build";
    setMockupMode(mode);
    const businessSlug = slugify(row.businessName);
    const prompt =
      mode === "revamp"
        ? `I need you to rebuild this local business website from scratch.\n\nBusiness: ${row.businessName}\nCurrent site URL: ${row.website}\nNiche: ${csvMeta.niche}\nCity: ${csvMeta.city}\n\nStep 1: Scrape their current website for all real information (business name, actual services, real phone number, address, hours, any testimonials).\n\nStep 2: Build a brand new single-page website using that real information. Do NOT use their old design. Build something completely modern and premium.\n\nDesign requirements:\n- Dark modern design, mobile responsive\n- Primary accent color: ${mockupAccent.toUpperCase()}\n- Hero with strong headline and CTA\n- Services section, about, testimonials, contact\n- Real copy throughout, zero placeholders\n\nSave as: ${businessSlug}-revamp.html\n\nThis revamp should look like a $5,000 website next to their current site.\n\nTECHNICAL OUTPUT REQUIREMENTS:\n- Wrap the seven core sections (hero, services, trust, testimonials, about, contact, footer) in top-level elements with matching data-section attributes.\n- Output the COMPLETE HTML in a single fenced \`\`\`html code block. No commentary outside the code block.`
        : `You are a professional web developer building a high-converting landing page for a local business.\n\nClient info:\n- Business name: ${row.businessName}\n- Type of business: ${csvMeta.niche}\n- Location: ${row.address || csvMeta.city}\n- Phone: ${row.phone}\n- Existing website to reference (if any): ${row.website || "none"}\n\nBuild a complete, modern, single-page website with hero, services, trust signals, testimonials, about, contact, footer sections.\n\nDesign requirements:\n- Dark modern aesthetic\n- Primary accent color: ${mockupAccent.toUpperCase()}\n- Mobile responsive\n- Clean Inter or Poppins font\n- Real copy, zero placeholders\n\nSave as: ${businessSlug}-website.html\n\nTECHNICAL OUTPUT REQUIREMENTS:\n- Wrap each of the seven sections (hero, services, trust, testimonials, about, contact, footer) in top-level elements with matching data-section attributes.\n- Output the COMPLETE HTML in a single fenced \`\`\`html code block. No commentary outside the code block.`;

    setMockupRunning(true);
    setMockupRowKey(rowKey);
    pendingMockupRef.current = { rowKey, businessName: row.businessName, prospectSlug, mode };
    const id = `seq-mockup-${Date.now().toString(36)}`;
    mockupIdRef.current = id;
    try {
      await api.runWebDesigner(id, root, prospectSlug, mode, prompt, businessSlug, "outreach");
    } catch (e) {
      setMockupRunning(false);
      setMockupError(String(e));
    }
  };

  // ─── Step navigation ─────────────────────────────────
  const stepperItems: { id: Step; label: string; sub: string; Icon: typeof IconTarget }[] = [
    { id: "scrape", label: "Scrape", sub: "Find leads", Icon: IconTarget },
    { id: "call", label: "Cold Call", sub: "Dial the list", Icon: IconPhone },
    { id: "mockup", label: "Websites", sub: "Build for booked", Icon: IconLayout },
    { id: "summary", label: "Summary", sub: "Wrap up", Icon: IconArrowRight },
  ];

  const stepIndex = stepperItems.findIndex((s) => s.id === step);

  const goStep = (next: Step) => setStep(next);

  return (
    <div className="hml-content">
      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <IconPhone size={11} />
            Cold Call Sequence
          </div>
          <h1 className="hml-page-title">Run a full cold-call pass.</h1>
          <div className="hml-page-subtitle">
            Scrape leads, dial through the list, book the ones that pick up, and build websites only for the bookings.
            Unbooked leads stay ephemeral; everything you book persists to Prospects.
          </div>
        </div>
        <div className="hml-page-header-actions">
          <button type="button" className="hml-btn" onClick={onExit}>
            ‹ Back to hub
          </button>
        </div>
      </section>

      {/* Stepper */}
      <section className="os-stepper">
        {stepperItems.map((item, i) => {
          const active = step === item.id;
          const done = i < stepIndex;
          const { Icon } = item;
          return (
            <button
              key={item.id}
              type="button"
              className={`os-step${active ? " os-step-active" : ""}${done ? " os-step-done" : ""}`}
              onClick={() => goStep(item.id)}
              title={`Go to ${item.label}`}
            >
              <span className="os-step-num">{i + 1}</span>
              <span className="os-step-body">
                <span className="os-step-label">
                  <Icon size={12} />
                  {item.label}
                </span>
                <span className="os-step-sub">{item.sub}</span>
              </span>
              {i < stepperItems.length - 1 && (
                <IconChevronRight size={10} className="os-step-arrow" />
              )}
            </button>
          );
        })}
      </section>

      {step === "scrape" && (
        <ScrapeStep
          niche={scrapeNiche}
          setNiche={setScrapeNiche}
          city={scrapeCity}
          setCity={setScrapeCity}
          running={scrapeRunning}
          log={scrapeLog}
          error={scrapeError}
          logEndRef={logEndRef}
          onRun={onRunScrape}
          history={csvHistory}
          activeCsv={csvFile}
          onPickCsv={async (f) => {
            await loadCsv(f);
            setStep("call");
          }}
          rootMissing={!root}
        />
      )}

      {step === "call" && (
        <CallStep
          csvFile={csvFile}
          rows={csvRows}
          meta={csvMeta}
          calls={calls}
          bookedCount={bookedCount}
          onDispose={setDisposition}
          onBook={bookProspect}
          onContinue={() => setStep("mockup")}
          onBack={() => setStep("scrape")}
        />
      )}

      {step === "mockup" && (
        <MockupStep
          csvFile={csvFile}
          rows={bookedRows}
          mockups={mockups}
          meta={csvMeta}
          accent={mockupAccent}
          setAccent={setMockupAccent}
          running={mockupRunning}
          runningRowKey={mockupRowKey}
          log={mockupLog}
          mode={mockupMode}
          error={mockupError}
          onBuild={onBuildMockup}
          onContinue={() => setStep("summary")}
          onBack={() => setStep("call")}
        />
      )}

      {step === "summary" && (
        <SummaryStep
          csvFile={csvFile}
          rows={csvRows}
          meta={csvMeta}
          calls={calls}
          mockups={mockups}
          bookedRows={bookedRows}
          onRestart={() => {
            setCsvFile(null);
            setCsvRows([]);
            setCalls({});
            setMockups([]);
            setStep("scrape");
          }}
          onBack={() => setStep("mockup")}
          accent={colorForNiche(csvMeta.niche)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 1 — Scrape
// ═══════════════════════════════════════════════════════════════

interface ScrapeStepProps {
  niche: string;
  setNiche: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  running: boolean;
  log: string[];
  error: string | null;
  logEndRef: React.RefObject<HTMLDivElement | null>;
  onRun: () => void;
  history: ProspectFile[];
  activeCsv: ProspectFile | null;
  onPickCsv: (f: ProspectFile) => void | Promise<void>;
  rootMissing: boolean;
}

function ScrapeStep({
  niche,
  setNiche,
  city,
  setCity,
  running,
  log,
  error,
  logEndRef,
  onRun,
  history,
  activeCsv,
  onPickCsv,
  rootMissing,
}: ScrapeStepProps) {
  return (
    <section className="os-step-pane">
      <div className="os-pane-head">
        <div>
          <h2>Step 1 · Scrape leads</h2>
          <p>Pull a fresh list of local businesses by niche and city, or pick up where you left off with an existing CSV.</p>
        </div>
      </div>

      <div className="os-grid-2">
        <form
          className="os-card"
          onSubmit={(e) => {
            e.preventDefault();
            onRun();
          }}
        >
          <div className="os-card-eyebrow">▸ New search</div>
          <label className="os-field">
            <span className="os-label">Niche</span>
            <input
              type="text"
              className="os-input"
              placeholder="dentists · HVAC companies · med spas"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              disabled={running}
              autoFocus
            />
          </label>
          <label className="os-field">
            <span className="os-label">City, state</span>
            <input
              type="text"
              className="os-input"
              placeholder="Tampa, FL"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={running}
            />
          </label>
          {error && <div className="os-error">{error}</div>}
          {rootMissing && (
            <div className="os-warn">
              No media-buying folder configured. Pick the folder from Settings (⚙) first.
            </div>
          )}
          <div className="os-card-actions">
            <button type="submit" className="os-primary" disabled={running || rootMissing}>
              {running ? "Running…" : "Run scraper →"}
            </button>
          </div>
        </form>

        <div className="os-card">
          <div className="os-card-eyebrow">▸ Live log</div>
          {log.length === 0 ? (
            <div className="os-empty">
              <div className="os-empty-title">Output will stream here</div>
              <div className="os-empty-sub">Hit Run scraper to start a new pull.</div>
            </div>
          ) : (
            <pre className="os-log">
              {log.join("\n")}
              <div ref={logEndRef} />
            </pre>
          )}
        </div>
      </div>

      <div className="os-card">
        <div className="os-card-eyebrow">▸ Or resume an existing CSV</div>
        {history.length === 0 ? (
          <div className="os-empty">
            <div className="os-empty-title">No CSVs yet</div>
            <div className="os-empty-sub">Run a scrape above and the file lands here.</div>
          </div>
        ) : (
          <div className="os-file-list">
            {history.map((f) => {
              const active = activeCsv?.path === f.path;
              return (
                <button
                  key={f.path}
                  type="button"
                  className={`os-file-row${active ? " os-file-row-active" : ""}`}
                  onClick={() => void onPickCsv(f)}
                >
                  <span className="os-file-name">{f.name}</span>
                  <span className="os-file-meta">{fmtWhen(f.modified_unix)}</span>
                  <span className="os-file-arrow">
                    Use this CSV
                    <IconArrowRight size={10} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 2 — Cold Call
// ═══════════════════════════════════════════════════════════════

interface CallStepProps {
  csvFile: ProspectFile | null;
  rows: CsvRow[];
  meta: { niche: string; city: string; date: string };
  calls: Record<string, CallRecord>;
  bookedCount: number;
  onDispose: (rowKey: string, disposition: CallDisposition) => void;
  onBook: (
    row: CsvRow,
    fields: {
      contactName: string;
      contactEmail: string;
      scheduledAt: string;
      notes: string;
    },
  ) => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
}

function CallStep({
  csvFile,
  rows,
  meta,
  calls,
  bookedCount,
  onDispose,
  onBook,
  onContinue,
  onBack,
}: CallStepProps) {
  const [filter, setFilter] = useState<"all" | "pending" | "booked">("all");
  const [openBookingFor, setOpenBookingFor] = useState<string | null>(null);

  if (!csvFile) {
    return (
      <section className="os-step-pane">
        <div className="os-empty">
          <div className="os-empty-title">No CSV loaded</div>
          <div className="os-empty-sub">Go back to step 1 and either scrape a new list or pick an existing CSV.</div>
          <button type="button" className="os-primary" onClick={onBack} style={{ marginTop: 12 }}>
            ‹ Back to scrape
          </button>
        </div>
      </section>
    );
  }

  const filtered = rows.filter((r) => {
    const d = calls[r.businessName]?.disposition ?? "pending";
    if (filter === "pending") return d === "pending";
    if (filter === "booked") return d === "booked";
    return true;
  });

  return (
    <section className="os-step-pane">
      <div className="os-pane-head">
        <div>
          <h2>Step 2 · Cold call the list</h2>
          <p>
            {rows.length} lead{rows.length === 1 ? "" : "s"} loaded from <code>{csvFile.name}</code>.
            Dial each one. When someone picks up and agrees to a discovery, click <strong>Book appointment</strong> —
            the lead becomes a scheduled prospect. Mark the rest <em>No answer</em> or <em>Not interested</em> and move on.
          </p>
        </div>
        <div className="os-pane-actions">
          <button type="button" className="hml-btn" onClick={onBack}>
            ‹ Back
          </button>
          <button
            type="button"
            className="os-primary"
            onClick={onContinue}
            disabled={bookedCount === 0}
            title={bookedCount === 0 ? "Book at least one lead first" : "Continue to websites"}
          >
            Continue to websites →
          </button>
        </div>
      </div>

      <div className="os-call-summary">
        <div className="os-call-stat">
          <span className="os-call-stat-num">{bookedCount}</span>
          <span className="os-call-stat-label">Booked</span>
        </div>
        <div className="os-call-stat">
          <span className="os-call-stat-num">
            {rows.filter((r) => (calls[r.businessName]?.disposition ?? "pending") === "pending").length}
          </span>
          <span className="os-call-stat-label">Pending</span>
        </div>
        <div className="os-call-stat">
          <span className="os-call-stat-num">
            {rows.filter((r) => calls[r.businessName]?.disposition === "no-answer").length}
          </span>
          <span className="os-call-stat-label">No answer</span>
        </div>
        <div className="os-call-stat">
          <span className="os-call-stat-num">
            {rows.filter((r) => calls[r.businessName]?.disposition === "not-interested").length}
          </span>
          <span className="os-call-stat-label">Not interested</span>
        </div>
        <div className="os-call-filter">
          <button
            type="button"
            className={`os-mini-btn${filter === "all" ? " os-mini-btn-primary" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`os-mini-btn${filter === "pending" ? " os-mini-btn-primary" : ""}`}
            onClick={() => setFilter("pending")}
          >
            Pending only
          </button>
          <button
            type="button"
            className={`os-mini-btn${filter === "booked" ? " os-mini-btn-primary" : ""}`}
            onClick={() => setFilter("booked")}
          >
            Booked only
          </button>
        </div>
      </div>

      <div className="os-call-list">
        {filtered.map((r) => {
          const rec = calls[r.businessName];
          const disposition: CallDisposition = rec?.disposition ?? "pending";
          const isOpen = openBookingFor === r.businessName;
          return (
            <div
              key={r.businessName}
              className={`os-call-card os-call-card-${disposition}`}
            >
              <div className="os-call-card-main">
                <div className="os-call-card-head">
                  <div className="os-call-card-name">
                    {r.businessName || "—"}
                    {r.rating && (
                      <span className="os-call-card-rating">
                        {r.rating}★ {r.reviews && `(${r.reviews})`}
                      </span>
                    )}
                  </div>
                  <DispositionBadge disposition={disposition} />
                </div>
                <div className="os-call-card-phone">
                  {r.phone ? (
                    <a href={`tel:${r.phone.replace(/\D/g, "")}`}>{fmtPhone(r.phone)}</a>
                  ) : (
                    <span className="os-call-card-phone-empty">No phone on file</span>
                  )}
                </div>
                <div className="os-call-card-meta">
                  {r.address && <span>{r.address}</span>}
                  {r.website && (
                    <span>
                      ·{" "}
                      <a
                        href={r.website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    </span>
                  )}
                  {r.runningAds && <span>· Ads: {r.runningAds}</span>}
                </div>
              </div>
              <div className="os-call-card-actions">
                {disposition === "booked" ? (
                  <button
                    type="button"
                    className="os-mini-btn"
                    onClick={() => onDispose(r.businessName, "pending")}
                    title="Undo booking (does not delete the prospect)"
                  >
                    Undo booked
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="os-mini-btn os-mini-btn-primary"
                      onClick={() => setOpenBookingFor(isOpen ? null : r.businessName)}
                    >
                      {isOpen ? "Cancel" : "Book appointment"}
                    </button>
                    <button
                      type="button"
                      className={`os-mini-btn${disposition === "no-answer" ? " os-mini-btn-on" : ""}`}
                      onClick={() =>
                        onDispose(
                          r.businessName,
                          disposition === "no-answer" ? "pending" : "no-answer",
                        )
                      }
                    >
                      No answer
                    </button>
                    <button
                      type="button"
                      className={`os-mini-btn${disposition === "not-interested" ? " os-mini-btn-on" : ""}`}
                      onClick={() =>
                        onDispose(
                          r.businessName,
                          disposition === "not-interested" ? "pending" : "not-interested",
                        )
                      }
                    >
                      Not interested
                    </button>
                  </>
                )}
              </div>
              {isOpen && disposition !== "booked" && (
                <BookingForm
                  row={r}
                  meta={meta}
                  onCancel={() => setOpenBookingFor(null)}
                  onSubmit={async (fields) => {
                    await onBook(r, fields);
                    setOpenBookingFor(null);
                  }}
                />
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="os-empty">
            <div className="os-empty-title">No leads in this filter</div>
            <div className="os-empty-sub">Switch to "All" to see the full list.</div>
          </div>
        )}
      </div>
    </section>
  );
}

function DispositionBadge({ disposition }: { disposition: CallDisposition }) {
  if (disposition === "booked") {
    return <span className="hml-pill hml-green"><span className="hml-pill-dot" />Booked</span>;
  }
  if (disposition === "no-answer") {
    return <span className="hml-pill hml-neutral"><span className="hml-pill-dot" />No answer</span>;
  }
  if (disposition === "not-interested") {
    return <span className="hml-pill hml-neutral"><span className="hml-pill-dot" />Not interested</span>;
  }
  return null;
}

function BookingForm({
  row,
  meta: _meta,
  onCancel,
  onSubmit,
}: {
  row: CsvRow;
  meta: { niche: string; city: string; date: string };
  onCancel: () => void;
  onSubmit: (fields: {
    contactName: string;
    contactEmail: string;
    scheduledAt: string;
    notes: string;
  }) => Promise<void>;
}) {
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="os-call-card-booking"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setSubmitting(true);
        try {
          await onSubmit({ contactName, contactEmail, scheduledAt, notes });
        } catch (e2) {
          setErr(e2 instanceof Error ? e2.message : String(e2));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="os-card-eyebrow">▸ Book {row.businessName}</div>
      <div className="os-call-card-booking-grid">
        <label className="os-field">
          <span className="os-label">Contact name</span>
          <input
            type="text"
            className="os-input"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Dr. Sarah Kim"
            autoFocus
          />
        </label>
        <label className="os-field">
          <span className="os-label">Contact email</span>
          <input
            type="email"
            className="os-input"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="sarah@business.com"
          />
        </label>
        <label className="os-field">
          <span className="os-label">Discovery call time</span>
          <input
            type="datetime-local"
            className="os-input"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </label>
        <label className="os-field">
          <span className="os-label">Phone</span>
          <input
            type="text"
            className="os-input"
            value={fmtPhone(row.phone)}
            disabled
          />
        </label>
        <label className="os-field os-field-full">
          <span className="os-label">Notes from the call</span>
          <textarea
            className="os-input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What they said, pain points, what to send before the call."
          />
        </label>
      </div>
      {err && <div className="os-error">{err}</div>}
      <div className="os-call-card-booking-actions">
        <button type="button" className="hml-btn" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button
          type="submit"
          className="os-primary"
          disabled={submitting}
        >
          {submitting ? "Saving…" : "Save booking"}
        </button>
      </div>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 3 — Websites (mockups for booked leads only)
// ═══════════════════════════════════════════════════════════════

interface MockupStepProps {
  csvFile: ProspectFile | null;
  rows: CsvRow[];
  mockups: MockupRecord[];
  meta: { niche: string; city: string; date: string };
  accent: string;
  setAccent: (v: string) => void;
  running: boolean;
  runningRowKey: string | null;
  log: string;
  mode: "build" | "revamp";
  error: string | null;
  onBuild: (row: CsvRow) => void;
  onContinue: () => void;
  onBack: () => void;
}

function MockupStep({
  csvFile,
  rows,
  mockups,
  meta,
  accent,
  setAccent,
  running,
  runningRowKey,
  log,
  mode,
  error,
  onBuild,
  onContinue,
  onBack,
}: MockupStepProps) {
  const mockupByRow = useMemo(() => {
    const m = new Map<string, MockupRecord>();
    for (const r of mockups) m.set(r.rowKey, r);
    return m;
  }, [mockups]);

  if (!csvFile) {
    return (
      <section className="os-step-pane">
        <div className="os-empty">
          <div className="os-empty-title">No CSV loaded</div>
          <div className="os-empty-sub">Go back to step 1 and either scrape a new list or pick an existing CSV.</div>
          <button type="button" className="os-primary" onClick={onBack} style={{ marginTop: 12 }}>
            ‹ Back to scrape
          </button>
        </div>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="os-step-pane">
        <div className="os-empty">
          <div className="os-empty-title">No booked leads yet</div>
          <div className="os-empty-sub">
            Websites are built only for prospects you booked in step 2. Go back and book at least one.
          </div>
          <button type="button" className="os-primary" onClick={onBack} style={{ marginTop: 12 }}>
            ‹ Back to cold call
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="os-step-pane">
      <div className="os-pane-head">
        <div>
          <h2>Step 3 · Build websites for booked prospects</h2>
          <p>
            {rows.length} booked prospect{rows.length === 1 ? "" : "s"}.
            Build a revamp HTML for each so you can show it on the discovery call.
            <span className="os-pane-hint"> Optional — skip ahead if you'd rather build sites later.</span>
          </p>
        </div>
        <div className="os-pane-actions">
          <button type="button" className="hml-btn" onClick={onBack}>
            ‹ Back
          </button>
          <button type="button" className="os-primary" onClick={onContinue}>
            Continue to summary →
          </button>
        </div>
      </div>

      <div className="os-card">
        <div className="os-card-eyebrow">▸ Accent color · applies to next mockup</div>
        <div className="os-accent-row">
          <input
            type="color"
            className="os-color-wheel"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            aria-label="Pick accent color"
          />
          <input
            type="text"
            className="os-input os-hex-input"
            value={accent.toUpperCase()}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) {
                setAccent(v.startsWith("#") ? v : `#${v}`);
              }
            }}
            spellCheck={false}
          />
          <span className="os-accent-preview" style={{ background: accent }} />
          <span className="os-hint">
            Niche detected: <strong>{meta.niche || "—"}</strong> · {meta.city || "—"}
          </span>
        </div>
      </div>

      <div className="os-card">
        <div className="os-card-eyebrow">▸ Booked prospects · {rows.length}</div>
        <div className="os-leads-table">
          <div className="os-leads-header">
            <span>Business</span>
            <span>Phone</span>
            <span>Website</span>
            <span>Rating</span>
            <span>Ads</span>
            <span style={{ textAlign: "right" }}>Mockup</span>
          </div>
          {rows.map((r) => {
            const isThisRunning = running && runningRowKey === r.businessName;
            const existing = mockupByRow.get(r.businessName);
            return (
              <div key={r.businessName} className="os-leads-row">
                <span className="os-leads-name">{r.businessName || "—"}</span>
                <span className="os-leads-meta">{fmtPhone(r.phone) || "—"}</span>
                <span className="os-leads-meta os-leads-url">
                  {r.website ? r.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : "—"}
                </span>
                <span className="os-leads-meta">
                  {r.rating ? `${r.rating}★` : "—"}
                  {r.reviews ? ` (${r.reviews})` : ""}
                </span>
                <span className="os-leads-meta">{r.runningAds || "—"}</span>
                <span className="os-leads-action">
                  {existing ? (
                    <button
                      type="button"
                      className="os-mini-btn"
                      onClick={() => void openPath(existing.path)}
                      title={existing.path}
                    >
                      ✓ Open
                    </button>
                  ) : isThisRunning ? (
                    <span className="os-mini-running">Building…</span>
                  ) : (
                    <button
                      type="button"
                      className="os-mini-btn os-mini-btn-primary"
                      onClick={() => onBuild(r)}
                      disabled={running || !r.businessName}
                    >
                      {r.website ? "Revamp" : "Build"}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {running && (
        <div className="os-card">
          <div className="os-card-eyebrow">
            ▸ {mode === "revamp" ? "Revamping" : "Building"} {runningRowKey}
          </div>
          <pre className="os-log">{log || "Booting Web Designer…"}</pre>
        </div>
      )}
      {error && <div className="os-error">{error}</div>}

      {mockups.length > 0 && (
        <div className="os-card">
          <div className="os-card-eyebrow">▸ Built this campaign · {mockups.length}</div>
          <div className="os-file-list">
            {mockups.map((m) => (
              <div key={m.rowKey} className="os-file-row">
                <span className="os-file-name">{m.businessName}</span>
                <span className="os-file-meta">{m.mode}</span>
                <div className="os-file-actions">
                  <button
                    type="button"
                    className="os-link"
                    onClick={() => void openPath(m.path)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="os-link"
                    onClick={() => void revealItemInDir(m.path)}
                  >
                    Reveal
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 4 — Summary
// ═══════════════════════════════════════════════════════════════

interface SummaryStepProps {
  csvFile: ProspectFile | null;
  rows: CsvRow[];
  meta: { niche: string; city: string; date: string };
  calls: Record<string, CallRecord>;
  mockups: MockupRecord[];
  bookedRows: CsvRow[];
  onRestart: () => void;
  onBack: () => void;
  accent: string;
}

function SummaryStep({
  csvFile,
  rows,
  meta,
  calls,
  mockups,
  bookedRows,
  onRestart,
  onBack,
  accent,
}: SummaryStepProps) {
  const noAnswer = Object.values(calls).filter((c) => c.disposition === "no-answer").length;
  const notInterested = Object.values(calls).filter((c) => c.disposition === "not-interested").length;

  return (
    <section className="os-step-pane">
      <div className="os-pane-head">
        <div>
          <h2>Step 4 · Summary</h2>
          <p>Here's what this cold-call pass produced. Booked prospects are saved to your Prospects list; unbooked leads stay ephemeral.</p>
        </div>
        <div className="os-pane-actions">
          <button type="button" className="hml-btn" onClick={onBack}>
            ‹ Back to websites
          </button>
          <button type="button" className="os-primary" onClick={onRestart}>
            Start a new pass →
          </button>
        </div>
      </div>

      <div className="os-summary-grid">
        <div className="os-card">
          <div className="os-card-eyebrow">▸ Campaign</div>
          <div className="os-summary-row">
            <span className="os-summary-key">Niche</span>
            <span className="os-summary-val">
              <span className="os-dot" style={{ background: accent }} />
              {meta.niche || "—"}
            </span>
          </div>
          <div className="os-summary-row">
            <span className="os-summary-key">Location</span>
            <span className="os-summary-val">{meta.city || "—"}</span>
          </div>
          <div className="os-summary-row">
            <span className="os-summary-key">Leads dialed</span>
            <span className="os-summary-val">{rows.length}</span>
          </div>
          <div className="os-summary-row">
            <span className="os-summary-key">Booked</span>
            <span className="os-summary-val">{bookedRows.length}</span>
          </div>
          <div className="os-summary-row">
            <span className="os-summary-key">No answer</span>
            <span className="os-summary-val">{noAnswer}</span>
          </div>
          <div className="os-summary-row">
            <span className="os-summary-key">Not interested</span>
            <span className="os-summary-val">{notInterested}</span>
          </div>
          <div className="os-summary-row">
            <span className="os-summary-key">Websites built</span>
            <span className="os-summary-val">{mockups.length}</span>
          </div>
        </div>

        <div className="os-card">
          <div className="os-card-eyebrow">▸ Files</div>
          {csvFile && (
            <button
              type="button"
              className="os-file-row"
              onClick={() => void openPath(csvFile.path)}
            >
              <span className="os-file-name">📊 {csvFile.name}</span>
              <span className="os-file-meta">CSV</span>
              <span className="os-file-arrow">Open →</span>
            </button>
          )}
          {mockups.map((m) => (
            <button
              key={m.rowKey}
              type="button"
              className="os-file-row"
              onClick={() => void openPath(m.path)}
            >
              <span className="os-file-name">🌐 {m.businessName}</span>
              <span className="os-file-meta">{m.mode}</span>
              <span className="os-file-arrow">Open →</span>
            </button>
          ))}
          {!csvFile && mockups.length === 0 && (
            <div className="os-empty">
              <div className="os-empty-title">Nothing yet</div>
              <div className="os-empty-sub">Run through the steps above.</div>
            </div>
          )}
        </div>
      </div>

      {bookedRows.length > 0 && (
        <div className="os-card">
          <div className="os-card-eyebrow">▸ Booked prospects · {bookedRows.length}</div>
          <div className="os-leads-table">
            <div className="os-leads-header">
              <span>Business</span>
              <span>Phone</span>
              <span>Scheduled</span>
              <span style={{ textAlign: "right" }}>Site</span>
            </div>
            {bookedRows.map((r) => {
              const rec = calls[r.businessName];
              const mock = mockups.find((m) => m.rowKey === r.businessName);
              return (
                <div key={r.businessName} className="os-leads-row">
                  <span className="os-leads-name">{r.businessName}</span>
                  <span className="os-leads-meta">{fmtPhone(r.phone) || "—"}</span>
                  <span className="os-leads-meta">
                    {rec?.scheduledAt
                      ? new Date(rec.scheduledAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                  <span className="os-leads-action">
                    {mock ? (
                      <button
                        type="button"
                        className="os-mini-btn"
                        onClick={() => void openPath(mock.path)}
                      >
                        Open
                      </button>
                    ) : (
                      <span className="os-mini-running">No site yet</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
