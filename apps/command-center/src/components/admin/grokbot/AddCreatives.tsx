import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ExternalLink, ImageIcon, Play, RefreshCw } from "lucide-react";
import { ErrorNote, Spinner } from "../../../routes/paid-ads/trackerShared";
import { useAuth } from "../../../context/AuthContext";
import { uploadAdCreativeFile, useAdminDriveCreativesQuery } from "../../../hooks/useApi";
import { fetchDriveImage, type DriveCreative } from "../../../lib/api";
import { clientPath } from "../../../lib/clientNav";
import { probeFile } from "../../../lib/creativeProbe";
import { shrinkCreative, UPLOAD_CAP_BYTES } from "../../../lib/shrinkCreative";
import { HEIC, PLAYABLE } from "../../../../functions/lib/creativePlayable";

// Client > Grok Bot > Add Creatives (Jake, 2026-10-27). A wizard a Grok Bot
// works through in its own browser, and Jake can too: pick files from the
// client's Drive "Finished Creatives" folder, add them, see what landed. Each
// one ends up on the client's own Paid Ads > Creatives page.
//
// The browser does the copy: the bytes come down through drive-images/:id and
// go up through the Creatives upload, so a video over 50 MB or any .mov is
// shrunk to MP4 on the way exactly as the drop zone does it. One file at a
// time, because every Drive read is a metered Composio call.

type Step = "pick" | "add" | "done";

type Job = {
  id: string;
  name: string;
  phase: "waiting" | "downloading" | "shrinking" | "uploading" | "added" | "failed";
  progress: number;
  error: string | null;
};

// Anything not PLAYABLE goes through shrinkCreative, which turns it into an MP4
// or a JPG or says why not.

// drive-images/:id serves Drive's own JPEG preview for a HEIC (Chrome cannot
// decode HEIC), so the copy is named and typed as the JPEG it is.
function asUpload(blob: Blob, f: DriveCreative): File {
  if (HEIC.test(f.mimeType)) return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  return new File([blob], f.name, { type: f.mimeType });
}

const sizeLabel = (bytes: number) =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000).toLocaleString()} KB`;

const STEPS: { id: Step; label: string }[] = [
  { id: "pick", label: "Pick" },
  { id: "add", label: "Add" },
  { id: "done", label: "Done" },
];

export default function AddCreatives({ tenantId }: { tenantId: string }) {
  const query = useAdminDriveCreativesQuery(tenantId);
  const [step, setStep] = useState<Step>("pick");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<Job[]>([]);

  const files = useMemo(() => query.data?.files ?? [], [query.data]);
  const fresh = useMemo(() => files.filter((f) => !f.inApp), [files]);
  const groups = useMemo(() => {
    const byFolder = new Map<string, DriveCreative[]>();
    for (const f of files) byFolder.set(f.folder, [...(byFolder.get(f.folder) ?? []), f]);
    return [...byFolder.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [files]);

  const patch = (id: string, change: Partial<Job>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...change } : j)));

  async function add(chosen: DriveCreative[]) {
    if (chosen.length === 0) return;
    setJobs(chosen.map((f) => ({ id: f.id, name: f.name, phase: "waiting", progress: 0, error: null })));
    setStep("add");
    for (const f of chosen) {
      try {
        patch(f.id, { phase: "downloading" });
        let file = asUpload(await fetchDriveImage(tenantId, f.id), f);
        if (file.size > UPLOAD_CAP_BYTES || !PLAYABLE.has(file.type)) {
          patch(f.id, { phase: "shrinking", progress: 0 });
          file = await shrinkCreative(file, (p) => patch(f.id, { progress: p }));
        }
        patch(f.id, { phase: "uploading", progress: 0 });
        const { width, height } = await probeFile(f.id, file);
        await uploadAdCreativeFile(tenantId, file, { width, height }, (p) => patch(f.id, { progress: p }), f.id);
        patch(f.id, { phase: "added", progress: 1 });
      } catch (err) {
        patch(f.id, { phase: "failed", error: (err as Error).message || "Could not add it." });
      }
    }
    setPicked(new Set());
    await query.refetch();
    setStep("done");
  }

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (list: DriveCreative[]) =>
    setPicked((prev) => {
      const next = new Set(prev);
      const open = list.filter((f) => !f.inApp);
      const all = open.every((f) => next.has(f.id));
      for (const f of open) {
        if (all) next.delete(f.id);
        else next.add(f.id);
      }
      return next;
    });

  const failed = jobs.filter((j) => j.phase === "failed");
  const added = jobs.filter((j) => j.phase === "added");
  const pickedFresh = fresh.filter((f) => picked.has(f.id));

  return (
    <section className="rounded-lg border border-border bg-surface p-4" data-step={step}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[15px] font-semibold text-text">Add Creatives</h2>
        {query.data?.finishedUrl && (
          <a
            href={query.data.finishedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-brand"
          >
            <ExternalLink size={14} /> Finished Creatives
          </a>
        )}
        {step === "pick" && (
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-brand disabled:opacity-60"
          >
            <RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} /> Refresh
          </button>
        )}
      </div>

      <ol className="mt-3 flex items-center gap-2" aria-label="Steps">
        {STEPS.map((s, i) => {
          const at = STEPS.findIndex((x) => x.id === step);
          const state = i < at ? "past" : i === at ? "current" : "next";
          return (
            <li key={s.id} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
              {i > 0 && <span className="h-px w-6 bg-border" aria-hidden />}
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11.5px] font-semibold ${
                  state === "next" ? "bg-surface-2 text-muted" : "bg-brand text-white"
                }`}
              >
                {state === "past" ? <Check size={13} /> : i + 1}
              </span>
              <span className={`text-[12.5px] font-semibold ${state === "next" ? "text-muted" : "text-text"}`}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4">
        {step === "pick" && (
          <PickStep
            tenantId={tenantId}
            loading={query.isLoading && !query.data}
            error={query.isLoadingError ? ((query.error as Error | null)?.message ?? "") : null}
            folderUrl={query.data?.folderUrl ?? null}
            finishedUrl={query.data?.finishedUrl ?? null}
            groups={groups}
            fresh={fresh}
            picked={picked}
            pickedCount={pickedFresh.length}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onAdd={() => void add(pickedFresh)}
          />
        )}

        {step !== "pick" && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {jobs.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </ul>
        )}

        {step === "done" && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-auto text-[13px] font-semibold text-text">
              {added.length} added{failed.length > 0 && <span className="text-danger"> · {failed.length} failed</span>}
            </span>
            {failed.length > 0 && (
              <button
                type="button"
                onClick={() => void add(files.filter((f) => failed.some((j) => j.id === f.id)))}
                className="rounded-[var(--radius)] border border-border px-3 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-brand"
              >
                Retry failed
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setJobs([]);
                setStep("pick");
              }}
              className="rounded-[var(--radius)] border border-border px-3 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-brand"
            >
              Add more
            </button>
            <OpenCreatives tenantId={tenantId} />
          </div>
        )}
      </div>
    </section>
  );
}

// The client's own Creatives page, entered the way "Enter live app" does, so
// what was added can be checked where the client sees it.
const CLIENT_CREATIVES = "/marketing/paid-ads/creatives";

function OpenCreatives({ tenantId }: { tenantId: string }) {
  const { previewClient } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setErr(null);
    const res = await previewClient(tenantId);
    if (res.ok) {
      navigate(CLIENT_CREATIVES, { replace: true });
    } else {
      setErr(res.error ?? "Could not open the client app.");
      setBusy(false);
    }
  };

  return (
    <>
      {err && <span className="text-[12px] text-danger">{err}</span>}
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="rounded-[var(--radius)] bg-brand px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {busy ? "Opening..." : "Open Creatives"}
      </button>
    </>
  );
}

function PickStep(props: {
  tenantId: string;
  loading: boolean;
  error: string | null;
  folderUrl: string | null;
  finishedUrl: string | null;
  groups: [string, DriveCreative[]][];
  fresh: DriveCreative[];
  picked: Set<string>;
  pickedCount: number;
  onToggle: (id: string) => void;
  onToggleAll: (list: DriveCreative[]) => void;
  onAdd: () => void;
}) {
  const { tenantId, groups, fresh, picked, pickedCount } = props;
  if (props.error !== null) return <ErrorNote message={props.error} />;
  if (props.loading) return <Spinner />;
  if (!props.folderUrl) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-[13px] text-muted">
        No Drive folder yet.
        <Link to={clientPath(tenantId, "brief")} className="font-semibold text-brand hover:underline">
          Mission Control
        </Link>
      </div>
    );
  }
  if (!props.finishedUrl) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-[13px] text-muted">
        No Finished Creatives folder.
        <a href={props.folderUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
          Drive folder
        </a>
      </div>
    );
  }
  if (groups.length === 0) return <p className="py-10 text-center text-[13px] text-muted">Finished Creatives is empty.</p>;

  const allFreshPicked = fresh.length > 0 && fresh.every((f) => picked.has(f.id));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[13px] text-muted">
          <span className="tnum font-semibold text-text">{fresh.length}</span> new
        </span>
        <button
          type="button"
          onClick={() => props.onToggleAll(fresh)}
          disabled={fresh.length === 0}
          className="rounded-[var(--radius)] border border-border px-3 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-brand disabled:opacity-40"
        >
          {allFreshPicked ? "Clear" : "Select all new"}
        </button>
        <button
          type="button"
          onClick={props.onAdd}
          disabled={pickedCount === 0}
          className="rounded-[var(--radius)] bg-brand px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {pickedCount > 0 ? `Add ${pickedCount} to client software` : "Add to client software"}
        </button>
      </div>

      <div className="flex flex-col gap-5">
        {groups.map(([folder, group]) => (
          <div key={folder}>
            <div className="mb-2 flex items-center gap-3">
              <h3 className="text-[13px] font-semibold text-text">{folder || "Finished Creatives"}</h3>
              {group.some((f) => !f.inApp) && (
                <button
                  type="button"
                  onClick={() => props.onToggleAll(group)}
                  className="text-[12px] font-medium text-muted transition-colors hover:text-brand"
                >
                  {group.filter((f) => !f.inApp).every((f) => picked.has(f.id)) ? "Clear" : "Select all"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {group.map((f) => (
                <Tile key={f.id} file={f} on={picked.has(f.id)} onToggle={() => props.onToggle(f.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Tile({ file, on, onToggle }: { file: DriveCreative; on: boolean; onToggle: () => void }) {
  const [broken, setBroken] = useState(false);
  // Drive hands out 220px thumbnails; the same link serves any size.
  const thumb = file.thumbnailLink?.replace(/=s\d+$/, "=s400") ?? null;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={file.inApp}
      aria-pressed={on}
      aria-label={`${file.name}${file.inApp ? ", in app" : ""}`}
      className={`group relative overflow-hidden rounded-lg border text-left transition-colors disabled:cursor-default ${
        file.inApp ? "border-border opacity-55" : on ? "border-brand ring-2 ring-brand" : "border-border hover:border-brand"
      }`}
    >
      <div className="relative flex aspect-square items-center justify-center bg-surface-2">
        {thumb && !broken ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon size={22} className="text-muted" aria-hidden />
        )}
        {file.kind === "video" && (
          <span className="absolute bottom-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
            <Play size={12} fill="currentColor" aria-hidden />
          </span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <div className="truncate text-[12px] font-medium text-text">{file.name}</div>
        <div className="tnum text-[11px] text-muted">{file.inApp ? "In app" : file.size != null ? sizeLabel(file.size) : ""}</div>
      </div>
      {(on || file.inApp) && (
        <span
          className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white ${
            file.inApp ? "bg-muted" : "bg-brand"
          }`}
        >
          <Check size={13} />
        </span>
      )}
    </button>
  );
}

const PHASE_LABEL: Record<Job["phase"], string> = {
  waiting: "Waiting",
  downloading: "Downloading",
  shrinking: "Shrinking",
  uploading: "Uploading",
  added: "Added",
  failed: "Failed",
};

function JobRow({ job }: { job: Job }) {
  const showBar = job.phase === "shrinking" || job.phase === "uploading";
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[13px] text-text">{job.name}</span>
      {job.phase === "failed" ? (
        <span className="text-[12px] font-medium text-danger">{job.error}</span>
      ) : job.phase === "added" ? (
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand">
          <Check size={13} /> Added
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="text-[12px] text-muted">{PHASE_LABEL[job.phase]}</span>
          {showBar && (
            <span className="flex w-32 items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-brand transition-[width]"
                  style={{ width: `${Math.round(job.progress * 100)}%` }}
                />
              </span>
              <span className="tnum w-9 text-right text-[12px] text-muted">{Math.round(job.progress * 100)}%</span>
            </span>
          )}
        </span>
      )}
    </li>
  );
}
