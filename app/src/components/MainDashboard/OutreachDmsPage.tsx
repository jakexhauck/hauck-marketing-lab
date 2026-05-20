/**
 * OutreachDmsPage — standalone personalized-DM workflow.
 *
 * Lifted out of the cold-call sequence (used to be Step 3) so it stays
 * available as a side-tab without cluttering the main flow. Pick a CSV (fresh
 * scrape or older one), tune the copywriter instructions, run, and copy the
 * generated DMs row by row.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { api } from "../../lib/tauri";
import type {
  CopywriterEvent,
  DmFile,
  ProspectFile,
} from "../../lib/types";
import { IconArrowRight, IconPen } from "../icons";

interface OutreachDmsPageProps {
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
Where Platform is one of: Instagram, Email, SMS, pick the channel most likely to land for that business.
Output ONLY the markdown table, no preamble, no commentary after.`;

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
    rows.push({
      business: cells[0],
      platform: cells[1],
      message: cells.slice(2).join(" | "),
    });
  }
  return rows;
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

export function OutreachDmsPage({ root, onExit }: OutreachDmsPageProps) {
  const [csvFile, setCsvFile] = useState<ProspectFile | null>(null);
  const [csvHistory, setCsvHistory] = useState<ProspectFile[]>([]);
  const [dmFile, setDmFile] = useState<DmFile | null>(null);
  const [dmBody, setDmBody] = useState<string>("");
  const dmTable = useMemo(() => parseDmTable(dmBody), [dmBody]);

  const [instructions, setInstructions] = useState<string>(DEFAULT_DM_PROMPT);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef<string>("");

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

  const pickCsv = useCallback(
    async (file: ProspectFile) => {
      setCsvFile(file);
      if (!root) return;
      try {
        const dms = await api.listDmFiles(root);
        const stem = file.name.replace(/\.csv$/i, "").replace(/^leads-/, "");
        const match = dms.find((d) => d.name === `dms-${stem}.md`);
        if (match) {
          setDmFile(match);
          const body = await api.readDmFile(match.path);
          setDmBody(body);
        } else {
          setDmFile(null);
          setDmBody("");
        }
      } catch {
        setDmFile(null);
        setDmBody("");
      }
    },
    [root],
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await api.onCopywriterStream((evt: CopywriterEvent) => {
        if (evt.id !== idRef.current) return;
        if (evt.kind === "started") {
          setLog("▸ Copywriter running…\n");
        } else if (evt.kind === "delta") {
          setLog((prev) => prev + evt.text);
        } else if (evt.kind === "done") {
          setRunning(false);
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
            setError(evt.message);
          }
        } else if (evt.kind === "error") {
          setRunning(false);
          setError(evt.message);
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [root]);

  const onRun = async () => {
    if (!root || !csvFile) return;
    setError(null);
    setLog("");
    setRunning(true);
    const id = `dms-${Date.now().toString(36)}`;
    idRef.current = id;
    try {
      await api.runCopywriter(id, root, csvFile.path, instructions);
    } catch (e) {
      setRunning(false);
      setError(String(e));
    }
  };

  return (
    <div className="hml-content">
      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <IconPen size={11} />
            Personalized DMs
          </div>
          <h1 className="hml-page-title">Bulk-write outreach DMs.</h1>
          <div className="hml-page-subtitle">
            Pick any scraped CSV, tune the brief, and let the copywriter agent produce a personalized DM per business.
            Lives outside the main cold-call sequence, use when you want a DM blast instead of (or alongside) a call pass.
          </div>
        </div>
        <div className="hml-page-header-actions">
          <button type="button" className="hml-btn" onClick={onExit}>
            ‹ Back to hub
          </button>
        </div>
      </section>

      <section className="os-step-pane">
        <div className="os-card">
          <div className="os-card-eyebrow">▸ Pick a CSV</div>
          {csvHistory.length === 0 ? (
            <div className="os-empty">
              <div className="os-empty-title">No CSVs yet</div>
              <div className="os-empty-sub">Run the lead scraper first.</div>
            </div>
          ) : (
            <div className="os-file-list">
              {csvHistory.map((f) => {
                const active = csvFile?.path === f.path;
                return (
                  <button
                    key={f.path}
                    type="button"
                    className={`os-file-row${active ? " os-file-row-active" : ""}`}
                    onClick={() => void pickCsv(f)}
                  >
                    <span className="os-file-name">{f.name}</span>
                    <span className="os-file-meta">{fmtWhen(f.modified_unix)}</span>
                    <span className="os-file-arrow">
                      {active ? "Selected" : "Use this CSV"}
                      <IconArrowRight size={10} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {csvFile && (
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
        )}

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
    </div>
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
