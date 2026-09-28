import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";
import {
  creativeKey,
  planCreatives,
  type CreativeKind,
  type DroppedFile,
  type PlannedFile,
} from "../../../../../functions/lib/creativeNames";
import type { LibraryItem } from "../../../../../functions/lib/metaUpload";
import { probeFile } from "../../../../lib/creativeProbe";
import { uploadCreativeImage, uploadCreativeVideo } from "../../../../hooks/useApi";

// Drop a pile of creatives, see how each will be filed, then send them to the
// client's Meta ad account. The plan is recomputed from the drop and the live
// library on every render, so a file that lands mid-session flips to "already
// in Meta" rather than being sent twice.

type RunState = { state: "uploading"; progress: number } | { state: "done" } | { state: "failed"; error: string };

let nextId = 0;

export default function CreativeUploader({
  tenantId,
  library,
  disabled,
}: {
  tenantId: string;
  library: LibraryItem[];
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [dropped, setDropped] = useState<DroppedFile[]>([]);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [runs, setRuns] = useState<Map<string, RunState>>(new Map());
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  // What Meta holds, as lookup keys, for the plan's "already in Meta" check.
  const existing = useMemo(() => {
    const sets: Record<CreativeKind, Set<string>> = { image: new Set(), video: new Set() };
    for (const it of library) sets[it.kind].add(creativeKey(it.base, it.ratio));
    return sets;
  }, [library]);

  const plan = useMemo(() => {
    const groups = planCreatives(dropped, existing);
    // A file this session sent is in Meta now, so the plan calls it a
    // duplicate; its row should keep saying Done instead.
    for (const g of groups) {
      for (const f of g.files) if (runs.get(f.id)?.state === "done") f.status = "ready";
    }
    return groups;
  }, [dropped, existing, runs]);

  // A failed file rejoins the queue: pressing Upload again is the retry.
  const ready = plan
    .flatMap((g) => g.files)
    .filter((f) => f.status === "ready" && (!runs.has(f.id) || runs.get(f.id)?.state === "failed"));

  async function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    setReading(true);
    const incoming = Array.from(list).map((file) => ({ id: `f${nextId++}`, file }));
    const probed = await Promise.all(incoming.map(({ id, file }) => probeFile(id, file)));
    setFiles((prev) => {
      const m = new Map(prev);
      for (const { id, file } of incoming) m.set(id, file);
      return m;
    });
    setDropped((prev) => [...prev, ...probed]);
    setReading(false);
  }

  function setRun(id: string, run: RunState) {
    setRuns((prev) => new Map(prev).set(id, run));
  }

  async function uploadAll() {
    setBusy(true);
    const kinds = new Map(dropped.map((d) => [d.id, d.kind]));
    // One at a time. A phone video is hundreds of megabytes; running several
    // side by side only makes every row slower and a failure harder to place.
    for (const f of ready) {
      const file = files.get(f.id);
      if (!file) continue;
      setRun(f.id, { state: "uploading", progress: 0 });
      try {
        if (kinds.get(f.id) === "video") {
          await uploadCreativeVideo(tenantId, file, f.name, (p) =>
            setRun(f.id, { state: "uploading", progress: p }),
          );
        } else {
          await uploadCreativeImage(tenantId, file, f.name);
        }
        setRun(f.id, { state: "done" });
      } catch (err) {
        setRun(f.id, { state: "failed", error: (err as Error).message });
      }
    }
    setBusy(false);
    await qc.invalidateQueries({ queryKey: ["admin", "creative-library", tenantId] });
  }

  function clear() {
    setDropped([]);
    setFiles(new Map());
    setRuns(new Map());
  }

  return (
    <section className="shrink-0 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-[15px] font-semibold text-text">Upload to Meta</h2>

      {disabled ? (
        <p className="mt-3 text-[13px] text-muted">No Meta ad account linked.</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void add(e.dataTransfer.files);
            }}
            disabled={busy}
            className={`mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-[13px] font-medium transition-colors disabled:opacity-50 ${
              over ? "border-brand bg-brand/5 text-brand" : "border-border text-muted hover:border-brand hover:text-brand"
            }`}
          >
            <UploadCloud size={22} aria-hidden />
            {reading ? "Reading files" : "Drop images and videos"}
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />

          {plan.length > 0 && (
            <>
              <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
                {plan.map((g) => (
                  <li key={g.key} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                    <div className="min-w-0 sm:w-56 sm:shrink-0">
                      <span className="block truncate text-[13px] font-semibold text-text">{g.base}</span>
                      <span className="text-[11.5px] uppercase tracking-wide text-faint">
                        {g.kind === "other" ? "File" : g.kind === "image" ? "Image" : "Video"}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      {g.files.map((f) => (
                        <FileChip key={f.id} file={f} run={runs.get(f.id)} />
                      ))}
                      {g.missing.map((r) => (
                        <span
                          key={r}
                          className="rounded-md border border-dashed border-warning/50 px-2 py-1 text-[12px] font-medium text-warning"
                        >
                          No {r}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void uploadAll()}
                  disabled={busy || ready.length === 0}
                  className="rounded-[var(--radius)] bg-brand px-4 py-2 text-[13px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? "Uploading" : `Upload ${ready.length}`}
                </button>
                <button
                  type="button"
                  onClick={clear}
                  disabled={busy}
                  className="text-[12.5px] font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function FileChip({ file, run }: { file: PlannedFile; run?: RunState }) {
  const base = "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium tnum";
  const label = file.ratio ?? `${file.width}×${file.height}`;

  if (run?.state === "uploading") {
    return (
      <span className={`${base} border-brand/40 text-brand`}>
        {label} · {Math.round(run.progress * 100)}%
      </span>
    );
  }
  if (run?.state === "done") return <span className={`${base} border-brand/40 bg-brand/10 text-brand`}>{label} · Done</span>;
  if (run?.state === "failed") {
    return (
      <span title={run.error} className={`${base} border-danger/40 bg-danger-tint text-danger`}>
        {label} · Failed: {run.error.slice(0, 80)}
      </span>
    );
  }

  switch (file.status) {
    case "ready":
      return <span className={`${base} border-border text-text`}>{label}</span>;
    case "duplicate":
      return <span className={`${base} border-border text-faint`}>{label} · Already in Meta</span>;
    case "clash":
      return <span className={`${base} border-border text-faint`}>{label} · Dropped twice</span>;
    case "bad-ratio":
      return <span className={`${base} border-danger/40 text-danger`}>{file.fileName} · Not 1:1 or 4:5 ({label})</span>;
    default:
      return <span className={`${base} border-danger/40 text-danger`}>{file.fileName} · Not an image or video</span>;
  }
}
