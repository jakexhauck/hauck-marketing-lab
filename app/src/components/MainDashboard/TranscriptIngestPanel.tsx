import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MEMORY_BUCKETS,
  type MemoryBucket,
  type ExtractedFact,
  type ExtractedUpdate,
  type ProfileAddition,
  type ExtractionResult,
  extractFromTranscript,
  commitExtraction,
} from "../../lib/transcriptIngest";
import { api } from "../../lib/tauri";
import { logActivity } from "../../lib/activity";

type Status =
  | "idle"
  | "saving"
  | "loading-context"
  | "extracting"
  | "review"
  | "committing"
  | "done"
  | "error";

interface ReviewFact extends ExtractedFact {
  id: string;
  keep: boolean;
}
interface ReviewUpdate extends ExtractedUpdate {
  id: string;
  keep: boolean;
}
interface ReviewProfile extends ProfileAddition {
  id: string;
  keep: boolean;
}

interface Props {
  root: string | null;
  clientSlug: string;
  clientName: string;
}

const ACCEPTED_EXTS = [".txt", ".vtt", ".md", ".srt"];

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const groupFactsByBucket = (facts: ReviewFact[]) => {
  const map = new Map<MemoryBucket, ReviewFact[]>();
  for (const b of MEMORY_BUCKETS) map.set(b, []);
  for (const f of facts) {
    const arr = map.get(f.bucket);
    if (arr) arr.push(f);
  }
  return map;
};

export function TranscriptIngestPanel({ root, clientSlug, clientName }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [fathomUrl, setFathomUrl] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const [reviewFacts, setReviewFacts] = useState<ReviewFact[]>([]);
  const [reviewUpdates, setReviewUpdates] = useState<ReviewUpdate[]>([]);
  const [reviewProfile, setReviewProfile] = useState<ReviewProfile[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [tab, setTab] = useState<"memory" | "profile" | "skipped">("memory");

  const [commitResult, setCommitResult] = useState<{
    memoryAppended: number;
    memorySuperseded: number;
    profileAppended: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Reset when the active client changes.
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSlug]);

  const reset = () => {
    setStatus("idle");
    setError(null);
    setFilename(null);
    setSavedPath(null);
    setReviewFacts([]);
    setReviewUpdates([]);
    setReviewProfile([]);
    setSkipped([]);
    setTab("memory");
    setCommitResult(null);
  };

  const runIngest = useCallback(
    async (sourceFilename: string, body: string) => {
      if (!root) {
        setError("Open a project root first.");
        setStatus("error");
        return;
      }
      setError(null);
      setFilename(sourceFilename);

      if (!body.trim()) {
        setError("Transcript body is empty.");
        setStatus("error");
        return;
      }

      setStatus("saving");
      let saved: { path: string; filename: string };
      try {
        saved = await api.saveTranscript(root, clientSlug, sourceFilename, body);
        setSavedPath(saved.path);
      } catch (e) {
        setError(`Save failed: ${e}`);
        setStatus("error");
        return;
      }

      setStatus("loading-context");
      let existingMemory = "";
      let existingProfile = "";
      try {
        const notes = await api.readClientNotes(root, clientSlug);
        const mem = notes.find((n) => n.path.toLowerCase().endsWith("memory.md"));
        const prof = notes.find((n) => n.path.toLowerCase().endsWith("profile.md"));
        existingMemory = mem?.body ?? "";
        existingProfile = prof?.body ?? "";
      } catch (e) {
        console.warn("Failed to read existing client notes:", e);
      }

      setStatus("extracting");
      let result: ExtractionResult;
      try {
        result = await extractFromTranscript({
          clientName,
          transcript: body,
          existingMemory,
          existingProfile,
        });
      } catch (e) {
        setError(`Extraction failed: ${e}. Raw transcript saved at ${saved.path}.`);
        setStatus("error");
        return;
      }

      const total =
        result.facts.length +
        result.updates.length +
        result.profileAdditions.length;
      if (total === 0) {
        setSkipped(result.skipped);
        setError(
          result.skipped.length > 0
            ? `Nothing new. ${result.skipped.length} duplicate(s) of existing Memory entries skipped.`
            : "No durable facts found. Raw transcript saved.",
        );
        setStatus("error");
        return;
      }

      setReviewFacts(
        result.facts.map((f) => ({ ...f, id: newId(), keep: true })),
      );
      setReviewUpdates(
        result.updates.map((u) => ({ ...u, id: newId(), keep: true })),
      );
      setReviewProfile(
        result.profileAdditions.map((p) => ({ ...p, id: newId(), keep: true })),
      );
      setSkipped(result.skipped);
      setTab(result.facts.length + result.updates.length > 0 ? "memory" : "profile");
      setStatus("review");
    },
    [root, clientSlug, clientName],
  );

  const ingestFile = useCallback(
    async (file: File) => {
      const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
      if (!ACCEPTED_EXTS.includes(ext)) {
        setError(`Unsupported file type. Use ${ACCEPTED_EXTS.join(", ")}.`);
        setStatus("error");
        return;
      }
      let body: string;
      try {
        body = await file.text();
      } catch (e) {
        setError(`Could not read file: ${e}`);
        setStatus("error");
        return;
      }
      await runIngest(file.name, body);
    },
    [runIngest],
  );

  const ingestUrl = useCallback(async () => {
    const url = fathomUrl.trim();
    if (!url) {
      setError("Paste a Fathom share URL first.");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("saving");
    setFilename(`fathom-${new Date().toISOString().slice(0, 10)}.txt`);
    try {
      const result = await api.fetchFathomTranscript(url);
      if (!result.text || result.text.trim().length < 200) {
        setError(
          "Fathom returned too little content. Login may be required. Export the transcript and drop the .txt instead.",
        );
        setStatus("error");
        return;
      }
      const slug = url
        .replace(/^https?:\/\/(app\.)?fathom\.video\//i, "")
        .replace(/[^a-zA-Z0-9-]/g, "-")
        .slice(0, 32) || "share";
      const name = `fathom-${slug}.txt`;
      setFathomUrl("");
      await runIngest(name, result.text);
    } catch (e) {
      setError(`Fathom fetch failed: ${e}`);
      setStatus("error");
    }
  }, [fathomUrl, runIngest]);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void ingestFile(file);
  };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void ingestFile(file);
    e.target.value = "";
  };

  const updateFactText = (id: string, text: string) =>
    setReviewFacts((prev) =>
      prev.map((f) => (f.id === id ? { ...f, text } : f)),
    );
  const toggleFactKeep = (id: string) =>
    setReviewFacts((prev) =>
      prev.map((f) => (f.id === id ? { ...f, keep: !f.keep } : f)),
    );
  const moveFactBucket = (id: string, bucket: MemoryBucket) =>
    setReviewFacts((prev) =>
      prev.map((f) => (f.id === id ? { ...f, bucket } : f)),
    );

  const toggleUpdateKeep = (id: string) =>
    setReviewUpdates((prev) =>
      prev.map((u) => (u.id === id ? { ...u, keep: !u.keep } : u)),
    );
  const updateUpdateText = (id: string, newText: string) =>
    setReviewUpdates((prev) =>
      prev.map((u) => (u.id === id ? { ...u, newText } : u)),
    );

  const toggleProfileKeep = (id: string) =>
    setReviewProfile((prev) =>
      prev.map((p) => (p.id === id ? { ...p, keep: !p.keep } : p)),
    );
  const updateProfileBullet = (id: string, bullet: string) =>
    setReviewProfile((prev) =>
      prev.map((p) => (p.id === id ? { ...p, bullet } : p)),
    );

  const commit = async () => {
    if (!root) return;
    const factsKept = reviewFacts.filter(
      (f) => f.keep && f.text.trim().length > 0,
    );
    const updatesKept = reviewUpdates.filter(
      (u) => u.keep && u.newText.trim().length > 0,
    );
    const profileKept = reviewProfile.filter(
      (p) => p.keep && p.bullet.trim().length > 0,
    );
    if (factsKept.length + updatesKept.length + profileKept.length === 0) {
      setError("Nothing checked. Tick at least one item.");
      return;
    }
    setStatus("committing");
    try {
      const res = await commitExtraction({
        root,
        clientSlug,
        source: filename ?? "transcript",
        facts: factsKept,
        updates: updatesKept,
        profileAdditions: profileKept,
      });
      setCommitResult(res);
      const memTotal = res.memoryAppended + res.memorySuperseded;
      const bits: string[] = [];
      if (memTotal > 0) bits.push(`${memTotal} memory`);
      if (res.profileAppended > 0) bits.push(`${res.profileAppended} profile`);
      await logActivity(root, {
        type: "memory.updated",
        clientSlug,
        summary: `Ingested ${filename ?? "transcript"}: ${bits.join(", ")}`,
      });
      setStatus("done");
    } catch (e) {
      setError(`Commit failed: ${e}`);
      setStatus("error");
    }
  };

  const grouped = useMemo(() => groupFactsByBucket(reviewFacts), [reviewFacts]);
  const memoryKept =
    reviewFacts.filter((f) => f.keep).length +
    reviewUpdates.filter((u) => u.keep).length;
  const profileKept = reviewProfile.filter((p) => p.keep).length;
  const totalKept = memoryKept + profileKept;

  const busy =
    status === "saving" ||
    status === "loading-context" ||
    status === "extracting" ||
    status === "committing";
  const busyLabel =
    status === "saving"
      ? "Saving transcript..."
      : status === "loading-context"
        ? "Loading existing Memory + Profile..."
        : status === "extracting"
          ? "Extracting facts via claude -p..."
          : status === "committing"
            ? "Writing to Memory.md + Profile.md..."
            : "";

  return (
    <div className="md-panel md-transcript-panel">
      <style>{TRANSCRIPT_PANEL_CSS}</style>
      <div className="md-panel-head">
        <span className="md-panel-title">▸ Drop Transcript → Memory + Profile</span>
        {status === "done" && (
          <button type="button" className="md-tx-reset" onClick={reset}>
            Drop another
          </button>
        )}
      </div>

      {(status === "idle" || status === "error") && (
        <>
          <div className="md-tx-url-row">
            <input
              type="url"
              className="md-tx-url-input"
              placeholder="Or paste a Fathom share URL (https://fathom.video/...)"
              value={fathomUrl}
              onChange={(e) => setFathomUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void ingestUrl();
              }}
            />
            <button
              type="button"
              className="md-tx-btn primary md-tx-url-btn"
              onClick={() => void ingestUrl()}
              disabled={!fathomUrl.trim()}
            >
              Fetch
            </button>
          </div>
          <div className="md-tx-or">or drop a file</div>
          <div
            className={`md-tx-drop ${dragOver ? "is-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <div className="md-tx-drop-icon">⇣</div>
            <div className="md-tx-drop-title">Drop a Fathom transcript here</div>
            <div className="md-tx-drop-sub">
              .txt, .vtt, .md, .srt &middot; raw file saved to _transcripts/, durable
              facts extracted into Memory.md, structural updates suggested for
              Profile.md
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.vtt,.md,.srt"
              style={{ display: "none" }}
              onChange={onFileChange}
            />
          </div>
          {error && <div className="md-tx-error">{error}</div>}
          {skipped.length > 0 && status === "error" && (
            <SkippedList skipped={skipped} />
          )}
        </>
      )}

      {busy && (
        <div className="md-tx-busy">
          <div className="md-tx-busy-spinner" />
          <div className="md-tx-busy-label">{busyLabel}</div>
          {filename && <div className="md-tx-busy-file">{filename}</div>}
        </div>
      )}

      {status === "review" && (
        <div className="md-tx-review">
          <div className="md-tx-review-head">
            <div>
              <div className="md-tx-review-title">
                {reviewFacts.length + reviewUpdates.length} memory,{" "}
                {reviewProfile.length} profile, {skipped.length} skipped
              </div>
              <div className="md-tx-review-sub">Source: {filename}</div>
            </div>
            <div className="md-tx-review-actions">
              <button
                type="button"
                className="md-tx-btn ghost"
                onClick={reset}
              >
                Discard
              </button>
              <button
                type="button"
                className="md-tx-btn primary"
                onClick={commit}
                disabled={totalKept === 0}
              >
                Commit {totalKept}
              </button>
            </div>
          </div>

          <div className="md-tx-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "memory"}
              className={`md-tx-tab ${tab === "memory" ? "is-active" : ""}`}
              onClick={() => setTab("memory")}
            >
              Memory
              <span className="md-tx-tab-count">
                {reviewFacts.length + reviewUpdates.length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "profile"}
              className={`md-tx-tab ${tab === "profile" ? "is-active" : ""}`}
              onClick={() => setTab("profile")}
              disabled={reviewProfile.length === 0}
            >
              Profile suggestions
              <span className="md-tx-tab-count">{reviewProfile.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "skipped"}
              className={`md-tx-tab ${tab === "skipped" ? "is-active" : ""}`}
              onClick={() => setTab("skipped")}
              disabled={skipped.length === 0}
            >
              Skipped
              <span className="md-tx-tab-count">{skipped.length}</span>
            </button>
          </div>

          {tab === "memory" && (
            <div className="md-tx-tabpane">
              {reviewUpdates.length > 0 && (
                <div className="md-tx-bucket">
                  <div className="md-tx-bucket-head md-tx-bucket-head-updates">
                    Supersedes existing
                  </div>
                  <ul className="md-tx-bucket-list">
                    {reviewUpdates.map((u) => (
                      <li
                        key={u.id}
                        className={`md-tx-update ${u.keep ? "" : "is-dropped"}`}
                      >
                        <input
                          type="checkbox"
                          className="md-tx-fact-check"
                          checked={u.keep}
                          onChange={() => toggleUpdateKeep(u.id)}
                        />
                        <div className="md-tx-update-body">
                          <div className="md-tx-update-old">
                            <span className="md-tx-update-tag">old</span>
                            <span>{u.oldSnippet}</span>
                          </div>
                          <textarea
                            className="md-tx-fact-text md-tx-update-new"
                            value={u.newText}
                            rows={1}
                            onChange={(e) =>
                              updateUpdateText(u.id, e.target.value)
                            }
                          />
                          {u.reason && (
                            <div className="md-tx-update-reason">{u.reason}</div>
                          )}
                          <div className="md-tx-update-bucket-tag">{u.bucket}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {MEMORY_BUCKETS.map((bucket) => {
                const items = grouped.get(bucket) ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={bucket} className="md-tx-bucket">
                    <div className="md-tx-bucket-head">{bucket}</div>
                    <ul className="md-tx-bucket-list">
                      {items.map((f) => (
                        <li
                          key={f.id}
                          className={`md-tx-fact ${f.keep ? "" : "is-dropped"}`}
                        >
                          <input
                            type="checkbox"
                            className="md-tx-fact-check"
                            checked={f.keep}
                            onChange={() => toggleFactKeep(f.id)}
                          />
                          <textarea
                            className="md-tx-fact-text"
                            value={f.text}
                            rows={1}
                            onChange={(e) =>
                              updateFactText(f.id, e.target.value)
                            }
                          />
                          <select
                            className="md-tx-fact-bucket"
                            value={f.bucket}
                            onChange={(e) =>
                              moveFactBucket(f.id, e.target.value as MemoryBucket)
                            }
                            title="Move to another bucket"
                          >
                            {MEMORY_BUCKETS.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

              {reviewFacts.length === 0 && reviewUpdates.length === 0 && (
                <div className="md-tx-empty">
                  No Memory changes. Try the Profile tab.
                </div>
              )}
            </div>
          )}

          {tab === "profile" && (
            <div className="md-tx-tabpane">
              {reviewProfile.length === 0 ? (
                <div className="md-tx-empty">No Profile suggestions.</div>
              ) : (
                <>
                  <div className="md-tx-tab-note">
                    Structural changes to who the client is or what they sell.
                    These append under the named section in Profile.md.
                  </div>
                  <ul className="md-tx-profile-list">
                    {reviewProfile.map((p) => (
                      <li
                        key={p.id}
                        className={`md-tx-profile ${p.keep ? "" : "is-dropped"}`}
                      >
                        <input
                          type="checkbox"
                          className="md-tx-fact-check"
                          checked={p.keep}
                          onChange={() => toggleProfileKeep(p.id)}
                        />
                        <div className="md-tx-profile-body">
                          <div className="md-tx-profile-section">
                            → ## {p.section}
                          </div>
                          <textarea
                            className="md-tx-fact-text"
                            value={p.bullet}
                            rows={1}
                            onChange={(e) =>
                              updateProfileBullet(p.id, e.target.value)
                            }
                          />
                          {p.reason && (
                            <div className="md-tx-update-reason">{p.reason}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {tab === "skipped" && (
            <div className="md-tx-tabpane">
              <div className="md-tx-tab-note">
                These came up in the call but were already in Memory.md, so they
                were dropped to avoid duplicates.
              </div>
              <ul className="md-tx-skipped-list">
                {skipped.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {status === "done" && commitResult && (
        <div className="md-tx-done">
          ✓ Memory: +{commitResult.memoryAppended} added,{" "}
          {commitResult.memorySuperseded} superseded. Profile: +
          {commitResult.profileAppended}.
          {savedPath && (
            <div className="md-tx-done-path">Raw transcript: {savedPath}</div>
          )}
        </div>
      )}
    </div>
  );
}

function SkippedList({ skipped }: { skipped: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md-tx-skipped-collapsed">
      <button
        type="button"
        className="md-tx-skipped-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▼" : "▶"} {skipped.length} skipped duplicate
        {skipped.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="md-tx-skipped-list">
          {skipped.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TRANSCRIPT_PANEL_CSS = `
.md-transcript-panel { display: flex; flex-direction: column; gap: 14px; }
.md-transcript-panel .md-panel-head { display: flex; justify-content: space-between; align-items: center; }

.md-tx-reset {
  background: transparent;
  border: 1px solid var(--md-border, var(--c-border));
  color: var(--md-text-dim, var(--c-muted));
  padding: 4px 10px;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 2px;
}
.md-tx-reset:hover { color: var(--md-text, var(--c-text)); border-color: rgba(var(--ink),0.35); }

.md-tx-url-row {
  display: flex; gap: 8px;
}
.md-tx-url-input {
  flex: 1;
  background: rgba(var(--ink),0.03);
  border: 1px solid var(--md-border, var(--c-border));
  color: var(--md-text, var(--c-text));
  font: inherit;
  font-size: 12.5px;
  padding: 8px 12px;
  border-radius: 3px;
  outline: none;
}
.md-tx-url-input:focus {
  border-color: var(--md-accent, var(--brand));
  background: rgba(var(--ink),0.05);
}
.md-tx-url-btn { flex-shrink: 0; }
.md-tx-or {
  text-align: center;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--md-text-dim, var(--c-muted));
  margin: -2px 0;
}

.md-tx-drop {
  border: 2px dashed var(--md-border, var(--c-border));
  border-radius: 6px;
  padding: 28px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
  background: rgba(var(--ink),0.015);
}
.md-tx-drop:hover, .md-tx-drop.is-over {
  border-color: var(--md-accent, var(--brand));
  background: color-mix(in srgb, var(--brand) 6%, transparent);
}
.md-tx-drop-icon { font-size: 28px; opacity: 0.7; margin-bottom: 6px; }
.md-tx-drop-title { font-size: 14px; font-weight: 500; margin-bottom: 4px; }
.md-tx-drop-sub { font-size: 11.5px; color: var(--md-text-dim, var(--c-muted)); line-height: 1.5; }

.md-tx-error {
  margin-top: 10px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  border-left: 2px solid var(--danger);
  border-radius: 2px;
}

.md-tx-busy {
  display: flex; align-items: center; gap: 12px;
  padding: 18px 16px;
  border: 1px solid var(--md-border, var(--c-border));
  border-radius: 4px;
  background: rgba(var(--ink),0.02);
}
.md-tx-busy-spinner {
  width: 16px; height: 16px;
  border: 2px solid rgba(var(--ink),0.2);
  border-top-color: var(--md-accent, var(--brand));
  border-radius: 50%;
  animation: md-tx-spin 700ms linear infinite;
  flex-shrink: 0;
}
@keyframes md-tx-spin { to { transform: rotate(360deg); } }
.md-tx-busy-label { font-size: 13px; }
.md-tx-busy-file { font-size: 11px; color: var(--md-text-dim, var(--c-muted)); margin-left: auto; }

.md-tx-review { display: flex; flex-direction: column; gap: 14px; }
.md-tx-review-head {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--md-border, var(--c-border));
}
.md-tx-review-title { font-size: 13px; font-weight: 500; }
.md-tx-review-sub { font-size: 11px; color: var(--md-text-dim, var(--c-muted)); margin-top: 2px; }
.md-tx-review-actions { display: flex; gap: 8px; }

.md-tx-btn {
  padding: 6px 14px;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 2px;
  border: 1px solid var(--md-border, var(--c-border));
  background: transparent;
  color: var(--md-text, var(--c-text));
}
.md-tx-btn.ghost:hover { border-color: rgba(var(--ink),0.4); }
.md-tx-btn.primary {
  background: var(--md-accent, var(--brand));
  border-color: var(--md-accent, var(--brand));
  color: var(--brand-fg);
  font-weight: 600;
}
.md-tx-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }
.md-tx-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.md-tx-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--md-border, var(--c-border));
}
.md-tx-tab {
  background: transparent;
  border: none;
  color: var(--md-text-dim, var(--c-muted));
  font-size: 11.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 8px 14px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  display: flex; align-items: center; gap: 8px;
}
.md-tx-tab:hover:not(:disabled) { color: var(--md-text, var(--c-text)); }
.md-tx-tab.is-active {
  color: var(--md-text, var(--c-text));
  border-bottom-color: var(--md-accent, var(--brand));
}
.md-tx-tab:disabled { opacity: 0.35; cursor: not-allowed; }
.md-tx-tab-count {
  display: inline-block;
  min-width: 18px; height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: rgba(var(--ink),0.08);
  font-size: 10.5px;
  line-height: 18px;
  text-align: center;
  letter-spacing: 0;
}
.md-tx-tabpane { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
.md-tx-tab-note {
  font-size: 11.5px;
  color: var(--md-text-dim, var(--c-muted));
  line-height: 1.5;
  padding: 8px 10px;
  background: rgba(var(--ink),0.025);
  border-left: 2px solid rgba(var(--ink),0.15);
  border-radius: 2px;
}
.md-tx-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--md-text-dim, var(--c-muted));
}

.md-tx-bucket { display: flex; flex-direction: column; gap: 6px; }
.md-tx-bucket-head {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--md-text-dim, var(--c-muted));
  padding-bottom: 4px;
  border-bottom: 1px dotted rgba(var(--ink),0.08);
}
.md-tx-bucket-head-updates { color: var(--warning); }
.md-tx-bucket-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }

.md-tx-fact {
  display: grid;
  grid-template-columns: 22px 1fr 160px;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 3px;
  transition: opacity 120ms ease, background 120ms ease;
}
.md-tx-fact:hover { background: rgba(var(--ink),0.025); }
.md-tx-fact.is-dropped { opacity: 0.4; }
.md-tx-fact.is-dropped .md-tx-fact-text { text-decoration: line-through; }
.md-tx-fact-check { margin: 0; cursor: pointer; }
.md-tx-fact-text {
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  line-height: 1.45;
  padding: 4px 6px;
  resize: vertical;
  width: 100%;
  outline: none;
  border-radius: 2px;
}
.md-tx-fact-text:focus { background: rgba(var(--ink),0.04); }
.md-tx-fact-bucket {
  background: transparent;
  border: 1px solid var(--md-border, var(--c-border));
  color: var(--md-text-dim, var(--c-muted));
  font-size: 11px;
  padding: 4px 6px;
  border-radius: 2px;
  cursor: pointer;
}

.md-tx-update {
  display: grid;
  grid-template-columns: 22px 1fr;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--warning) 4%, transparent);
  border-left: 2px solid var(--warning);
  transition: opacity 120ms ease;
}
.md-tx-update.is-dropped { opacity: 0.4; }
.md-tx-update.is-dropped .md-tx-update-new { text-decoration: line-through; }
.md-tx-update-body { display: flex; flex-direction: column; gap: 4px; }
.md-tx-update-old {
  display: flex; align-items: center; gap: 8px;
  font-size: 11.5px;
  color: var(--md-text-dim, var(--c-muted));
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--warning) 60%, transparent);
}
.md-tx-update-tag {
  font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase;
  background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning);
  padding: 1px 6px; border-radius: 2px;
  text-decoration: none;
}
.md-tx-update-new { font-weight: 500; }
.md-tx-update-reason {
  font-size: 11px;
  color: var(--md-text-dim, var(--c-muted));
  font-style: italic;
}
.md-tx-update-bucket-tag {
  font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--md-text-dim, var(--c-muted));
  align-self: flex-start;
}

.md-tx-profile-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.md-tx-profile {
  display: grid;
  grid-template-columns: 22px 1fr;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--hue-blue) 4%, transparent);
  border-left: 2px solid var(--hue-blue);
  transition: opacity 120ms ease;
}
.md-tx-profile.is-dropped { opacity: 0.4; }
.md-tx-profile-body { display: flex; flex-direction: column; gap: 4px; }
.md-tx-profile-section {
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hue-blue);
}

.md-tx-skipped-list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 4px;
  font-size: 11.5px;
  color: var(--md-text-dim, var(--c-muted));
}
.md-tx-skipped-list li {
  padding: 4px 10px;
  border-left: 2px solid rgba(var(--ink),0.1);
}

.md-tx-skipped-collapsed { margin-top: 10px; }
.md-tx-skipped-toggle {
  background: transparent; border: none;
  color: var(--md-text-dim, var(--c-muted));
  font-size: 11.5px;
  cursor: pointer;
  padding: 4px 0;
}
.md-tx-skipped-toggle:hover { color: var(--md-text, var(--c-text)); }

.md-tx-done {
  padding: 14px 16px;
  font-size: 13px;
  color: var(--positive);
  background: color-mix(in srgb, var(--positive) 6%, transparent);
  border-left: 2px solid var(--positive);
  border-radius: 2px;
}
.md-tx-done-path {
  font-size: 11px;
  color: var(--md-text-dim, var(--c-muted));
  margin-top: 6px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  word-break: break-all;
}
`;
