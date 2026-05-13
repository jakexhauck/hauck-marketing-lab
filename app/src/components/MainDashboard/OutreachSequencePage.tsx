/**
 * OutreachSequencePage — guided 4-step campaign wizard.
 *
 *   1. Scrape   — run lead-scraper, capture the CSV
 *   2. Mockups  — pick prospects to build revamp HTML for (optional)
 *   3. DMs      — feed CSV to copywriter, produce DM markdown table
 *   4. Summary  — review everything created, links + DM table inline
 *
 * Steps share campaign state so the user can flip back and forth via the
 * stepper at the top without losing work. Mockups and DMs are saved to disk,
 * so the wizard can be closed and resumed (by re-picking the CSV).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "../../lib/tauri";
import type {
  CopywriterEvent,
  DmFile,
  ProspectFile,
  ScraperEvent,
  WebDesignerEvent,
} from "../../lib/types";
import {
  IconArrowRight,
  IconChevronRight,
  IconLayout,
  IconTarget,
  IconPen,
} from "../icons";

type Step = "scrape" | "mockup" | "dm" | "summary";

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

const DEFAULT_DM_PROMPT = `I have this list of local businesses I want to reach out to about running ads for them.

For each business, write a short personalized DM (2-3 sentences max) that:
- References something specific about their business
- Points out a gap or opportunity (bad website, no ads, etc.)
- Ends with a soft ask to jump on a quick call

Keep it casual and conversational, not salesy. Sound like a real person who genuinely noticed something about their business, not like a template blast.

Output as a markdown table with exactly these columns: Business Name | Platform | Message
Where Platform is one of: Instagram, Email, SMS — pick the channel most likely to land for that business.
Output ONLY the markdown table — no preamble, no commentary after.`;

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

/** Minimal CSV parser. Handles quoted values that contain commas and escaped
 *  quotes. Returns header row + records. */
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
  // Files come from scraper as `<city>-<state>-<niche>-<date>.csv`, e.g.
  // tampa-fl-dentists-2026-05-12.csv. Pull off the date suffix and reverse-
  // engineer the niche + city. Cheap heuristic — falls back to "" on miss.
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

interface DmTableRow {
  business: string;
  platform: string;
  message: string;
}

function parseDmTable(body: string): DmTableRow[] {
  const lines = body.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    const row = lines[i].trim();
    const sep = lines[i + 1].trim();
    if (
      row.startsWith("|") &&
      row.endsWith("|") &&
      sep.startsWith("|") &&
      sep.includes("---")
    ) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];
  const rows: DmTableRow[] = [];
  for (let j = start + 2; j < lines.length; j++) {
    const row = lines[j].trim();
    if (!row.startsWith("|") || !row.endsWith("|")) break;
    const cells = row
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 3) continue;
    rows.push({ business: cells[0], platform: cells[1], message: cells.slice(2).join(" | ") });
  }
  return rows;
}

export function OutreachSequencePage({ root, onExit }: OutreachSequencePageProps) {
  const [step, setStep] = useState<Step>("scrape");

  // Campaign state ─────────────────────────────────────────
  const [csvFile, setCsvFile] = useState<ProspectFile | null>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvMeta, setCsvMeta] = useState<{ niche: string; city: string; date: string }>({
    niche: "",
    city: "",
    date: "",
  });
  const [mockups, setMockups] = useState<MockupRecord[]>([]);
  const [dmFile, setDmFile] = useState<DmFile | null>(null);
  const [dmBody, setDmBody] = useState<string>("");
  const dmTable = useMemo(() => parseDmTable(dmBody), [dmBody]);

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

  // Loading a CSV (either freshly scraped or picked from history)
  const loadCsv = useCallback(
    async (file: ProspectFile) => {
      try {
        const body = await api.readDmFile(file.path);
        const parsed = parseCsv(body);
        setCsvFile(file);
        setCsvHeaders(parsed.headers);
        setCsvRows(parsed.rows.map(toCsvRow));
        setCsvMeta(parseFilenameMeta(file.name));
        // Try to find a previously-generated DM file for the same CSV.
        try {
          const dms = await api.listDmFiles(root!);
          const stem = file.name.replace(/\.csv$/i, "").replace(/^leads-/, "");
          const match = dms.find((d) => d.name === `dms-${stem}.md`);
          if (match) {
            setDmFile(match);
            const dmBodyStr = await api.readDmFile(match.path);
            setDmBody(dmBodyStr);
          } else {
            setDmFile(null);
            setDmBody("");
          }
        } catch {
          setDmFile(null);
          setDmBody("");
        }
      } catch (e) {
        console.warn("loadCsv failed:", e);
      }
    },
    [root],
  );

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
            // Refresh history, find the new CSV, auto-load it, advance.
            void (async () => {
              await refreshHistory();
              if (!root) return;
              try {
                const list = await api.listProspectFiles(root);
                setCsvHistory(list);
                const fresh = list.find((f) => f.path === evt.csv_path);
                if (fresh) {
                  await loadCsv(fresh);
                  setStep("mockup");
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

  // ─── Step 2: Mockups ──────────────────────────────────
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
    // 1. Promote lead to prospect so the slug exists and Web Designer can
    //    save under vault/Outreach/<slug>/revamp/.
    let prospectSlug = slugify(row.businessName);
    try {
      const created = await api.promoteLeadToProspect(root, {
        name: row.businessName,
        niche: csvMeta.niche || null,
        url: row.website || null,
      });
      if (created?.slug) prospectSlug = created.slug;
    } catch (e) {
      // Non-fatal — fall back to local slugify.
      console.warn("promoteLeadToProspect failed, using local slug:", e);
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

  // ─── Step 3: Copywriter / DMs ─────────────────────────
  const [dmInstructions, setDmInstructions] = useState<string>(DEFAULT_DM_PROMPT);
  const [dmRunning, setDmRunning] = useState(false);
  const [dmLog, setDmLog] = useState<string>("");
  const [dmError, setDmError] = useState<string | null>(null);
  const dmIdRef = useRef<string>("");

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await api.onCopywriterStream((evt: CopywriterEvent) => {
        if (evt.id !== dmIdRef.current) return;
        if (evt.kind === "started") {
          setDmLog("▸ Copywriter running…\n");
        } else if (evt.kind === "delta") {
          setDmLog((prev) => prev + evt.text);
        } else if (evt.kind === "done") {
          setDmRunning(false);
          if (evt.ok && evt.path && evt.body) {
            setDmBody(evt.body);
            void (async () => {
              if (!root) return;
              try {
                const list = await api.listDmFiles(root);
                const match = list.find((d) => d.path === evt.path);
                if (match) setDmFile(match);
              } catch {
                /* ignore */
              }
            })();
          } else if (evt.message) {
            setDmError(evt.message);
          }
        } else if (evt.kind === "error") {
          setDmRunning(false);
          setDmError(evt.message);
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [root]);

  const onRunCopywriter = async () => {
    if (!root || !csvFile) return;
    setDmError(null);
    setDmLog("");
    setDmRunning(true);
    const id = `seq-dm-${Date.now().toString(36)}`;
    dmIdRef.current = id;
    try {
      await api.runCopywriter(id, root, csvFile.path, dmInstructions);
    } catch (e) {
      setDmRunning(false);
      setDmError(String(e));
    }
  };

  // ─── Step navigation ─────────────────────────────────
  const stepperItems: { id: Step; label: string; sub: string; Icon: typeof IconTarget }[] = [
    { id: "scrape", label: "Scrape", sub: "Find leads", Icon: IconTarget },
    { id: "mockup", label: "Mockups", sub: "Build proofs", Icon: IconLayout },
    { id: "dm", label: "DMs", sub: "Write outreach", Icon: IconPen },
    { id: "summary", label: "Summary", sub: "Wrap up", Icon: IconArrowRight },
  ];

  const stepIndex = stepperItems.findIndex((s) => s.id === step);

  const goStep = (next: Step) => {
    // Allow free navigation between steps — work persists on disk.
    setStep(next);
  };

  // ─── Render ──────────────────────────────────────────
  return (
    <div className="hml-content">
      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <IconTarget size={11} />
            Outreach Sequence
          </div>
          <h1 className="hml-page-title">Run a full outreach pass.</h1>
          <div className="hml-page-subtitle">
            Scrape leads → build mockups for the ones you want to pitch → write personalized DMs → review.
            Skip any step you don't need; everything saves to disk so you can come back.
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

      {/* Step bodies */}
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
            setStep("mockup");
          }}
          rootMissing={!root}
        />
      )}

      {step === "mockup" && (
        <MockupStep
          csvFile={csvFile}
          rows={csvRows}
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
          onContinue={() => setStep("dm")}
          onBack={() => setStep("scrape")}
        />
      )}

      {step === "dm" && (
        <DmStep
          csvFile={csvFile}
          rows={csvRows}
          headers={csvHeaders}
          instructions={dmInstructions}
          setInstructions={setDmInstructions}
          running={dmRunning}
          log={dmLog}
          error={dmError}
          dmFile={dmFile}
          dmTable={dmTable}
          dmBody={dmBody}
          history={csvHistory}
          onSwitchCsv={loadCsv}
          onRun={onRunCopywriter}
          onContinue={() => setStep("summary")}
          onBack={() => setStep("mockup")}
        />
      )}

      {step === "summary" && (
        <SummaryStep
          csvFile={csvFile}
          rows={csvRows}
          meta={csvMeta}
          mockups={mockups}
          dmFile={dmFile}
          dmTable={dmTable}
          onRestart={() => {
            setCsvFile(null);
            setCsvRows([]);
            setCsvHeaders([]);
            setMockups([]);
            setDmFile(null);
            setDmBody("");
            setStep("scrape");
          }}
          onBack={() => setStep("dm")}
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
          <p>Pull a fresh list of local businesses by niche and city — or pick up where you left off with an existing CSV.</p>
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
// Step 2 — Mockups
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

  return (
    <section className="os-step-pane">
      <div className="os-pane-head">
        <div>
          <h2>Step 2 · Build mockups</h2>
          <p>
            {rows.length} lead{rows.length === 1 ? "" : "s"} loaded from <code>{csvFile.name}</code>.
            Click "Build mockup" on any row you want to send a proof to.
            <span className="os-pane-hint"> Optional — skip ahead to DMs if you want a no-mockup pass.</span>
          </p>
        </div>
        <div className="os-pane-actions">
          <button type="button" className="hml-btn" onClick={onBack}>
            ‹ Back
          </button>
          <button type="button" className="os-primary" onClick={onContinue}>
            Continue to DMs →
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
        <div className="os-card-eyebrow">▸ Leads · {rows.length}</div>
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
                <span className="os-leads-meta">{r.phone || "—"}</span>
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
// Step 3 — DMs
// ═══════════════════════════════════════════════════════════════

interface DmStepProps {
  csvFile: ProspectFile | null;
  rows: CsvRow[];
  headers: string[];
  instructions: string;
  setInstructions: (v: string) => void;
  running: boolean;
  log: string;
  error: string | null;
  dmFile: DmFile | null;
  dmTable: DmTableRow[];
  dmBody: string;
  history: ProspectFile[];
  onSwitchCsv: (f: ProspectFile) => Promise<void>;
  onRun: () => void;
  onContinue: () => void;
  onBack: () => void;
}

function DmStep({
  csvFile,
  rows,
  headers,
  instructions,
  setInstructions,
  running,
  log,
  error,
  dmFile,
  dmTable,
  dmBody,
  history,
  onSwitchCsv,
  onRun,
  onContinue,
  onBack,
}: DmStepProps) {
  const [switching, setSwitching] = useState(false);

  if (!csvFile) {
    return (
      <section className="os-step-pane">
        <div className="os-empty">
          <div className="os-empty-title">No CSV loaded</div>
          <div className="os-empty-sub">Back up and pick a CSV first.</div>
          <button type="button" className="os-primary" onClick={onBack} style={{ marginTop: 12 }}>
            ‹ Back
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="os-step-pane">
      <div className="os-pane-head">
        <div>
          <h2>Step 3 · Write DMs</h2>
          <p>
            The copywriter agent reads the campaign CSV and produces a personalized DM for each business.
            Tune the instructions below if you want to change tone, length, or output columns.
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
            disabled={!dmFile}
            title={!dmFile ? "Run the copywriter first" : "Continue"}
          >
            Continue to summary →
          </button>
        </div>
      </div>

      <div className="os-card">
        <div className="os-card-eyebrow">▸ Campaign CSV</div>
        <div className="os-csv-summary">
          <div>
            <strong>{csvFile.name}</strong>
            <div className="os-hint">
              {rows.length} lead{rows.length === 1 ? "" : "s"} · columns: {headers.slice(0, 6).join(" · ")}
              {headers.length > 6 ? "…" : ""}
            </div>
          </div>
          <button
            type="button"
            className="os-link"
            onClick={() => setSwitching((v) => !v)}
          >
            {switching ? "Cancel swap" : "Use a different CSV"}
          </button>
        </div>
        {switching && (
          <div className="os-file-list" style={{ marginTop: 8 }}>
            {history.map((f) => (
              <button
                key={f.path}
                type="button"
                className={`os-file-row${f.path === csvFile.path ? " os-file-row-active" : ""}`}
                onClick={async () => {
                  await onSwitchCsv(f);
                  setSwitching(false);
                }}
              >
                <span className="os-file-name">{f.name}</span>
                <span className="os-file-meta">{fmtWhen(f.modified_unix)}</span>
                <span className="os-file-arrow">
                  Use →
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="os-card">
        <div className="os-card-eyebrow">▸ DM instructions</div>
        <textarea
          className="os-input os-textarea"
          rows={12}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          disabled={running}
          spellCheck={false}
        />
        <div className="os-hint">
          The CSV is appended automatically below your instructions when the run starts.
        </div>
        <div className="os-card-actions">
          <button
            type="button"
            className="os-primary"
            onClick={onRun}
            disabled={running}
          >
            {running ? "Writing DMs…" : dmFile ? "Re-run copywriter" : "Run copywriter →"}
          </button>
          {dmFile && (
            <button
              type="button"
              className="hml-btn"
              onClick={() => void openPath(dmFile.path)}
            >
              Open .md file
            </button>
          )}
        </div>
        {error && <div className="os-error">{error}</div>}
      </div>

      {running && (
        <div className="os-card">
          <div className="os-card-eyebrow">▸ Live output</div>
          <pre className="os-log">{log || "Thinking…"}</pre>
        </div>
      )}

      {dmTable.length > 0 && (
        <div className="os-card">
          <div className="os-card-eyebrow">▸ Generated DMs · {dmTable.length}</div>
          <DmTable rows={dmTable} />
        </div>
      )}
      {dmTable.length === 0 && dmBody && !running && (
        <div className="os-card">
          <div className="os-card-eyebrow">▸ Raw output</div>
          <pre className="os-log">{dmBody}</pre>
        </div>
      )}
    </section>
  );
}

function DmTable({ rows }: { rows: DmTableRow[] }) {
  const [copied, setCopied] = useState<number | null>(null);
  const copy = async (i: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(null), 1400);
    } catch (e) {
      console.warn(e);
    }
  };
  return (
    <div className="os-dm-table">
      <div className="os-dm-header">
        <span>Business</span>
        <span>Channel</span>
        <span>Message</span>
        <span style={{ textAlign: "right" }}>Copy</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="os-dm-row">
          <span className="os-dm-business">{r.business}</span>
          <span className={`os-dm-platform os-dm-platform-${r.platform.toLowerCase()}`}>
            {r.platform}
          </span>
          <span className="os-dm-msg">{r.message}</span>
          <span className="os-dm-action">
            <button
              type="button"
              className="os-mini-btn"
              onClick={() => void copy(i, r.message)}
            >
              {copied === i ? "✓ Copied" : "Copy"}
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 4 — Summary
// ═══════════════════════════════════════════════════════════════

interface SummaryStepProps {
  csvFile: ProspectFile | null;
  rows: CsvRow[];
  meta: { niche: string; city: string; date: string };
  mockups: MockupRecord[];
  dmFile: DmFile | null;
  dmTable: DmTableRow[];
  onRestart: () => void;
  onBack: () => void;
  accent: string;
}

function SummaryStep({
  csvFile,
  rows,
  meta,
  mockups,
  dmFile,
  dmTable,
  onRestart,
  onBack,
  accent,
}: SummaryStepProps) {
  return (
    <section className="os-step-pane">
      <div className="os-pane-head">
        <div>
          <h2>Step 4 · Summary</h2>
          <p>Here's everything this campaign produced. Click any step in the stepper above to revisit.</p>
        </div>
        <div className="os-pane-actions">
          <button type="button" className="hml-btn" onClick={onBack}>
            ‹ Back to DMs
          </button>
          <button type="button" className="os-primary" onClick={onRestart}>
            Start a new campaign →
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
            <span className="os-summary-key">Leads</span>
            <span className="os-summary-val">{rows.length}</span>
          </div>
          <div className="os-summary-row">
            <span className="os-summary-key">Mockups built</span>
            <span className="os-summary-val">{mockups.length}</span>
          </div>
          <div className="os-summary-row">
            <span className="os-summary-key">DMs written</span>
            <span className="os-summary-val">{dmTable.length || (dmFile ? "—" : 0)}</span>
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
          {dmFile && (
            <button
              type="button"
              className="os-file-row"
              onClick={() => void openPath(dmFile.path)}
            >
              <span className="os-file-name">✉️ {dmFile.name}</span>
              <span className="os-file-meta">DMs</span>
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
          {!csvFile && !dmFile && mockups.length === 0 && (
            <div className="os-empty">
              <div className="os-empty-title">Nothing yet</div>
              <div className="os-empty-sub">Run through the steps above.</div>
            </div>
          )}
        </div>
      </div>

      {dmTable.length > 0 && (
        <div className="os-card">
          <div className="os-card-eyebrow">▸ DMs · {dmTable.length}</div>
          <DmTable rows={dmTable} />
        </div>
      )}
    </section>
  );
}
