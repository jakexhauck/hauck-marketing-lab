import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, ExternalLink, ImageIcon, UploadCloud, X } from "lucide-react";
import { ErrorNote, Spinner } from "../../../routes/paid-ads/trackerShared";
import { useAdminDriveImagesQuery } from "../../../hooks/useApi";
import { fetchDriveImage, type DriveImage } from "../../../lib/api";
import { clientPath } from "../../../lib/clientNav";
import { toTextingJpeg } from "../../../lib/textingJpeg";

// Client > Image Converter (Jake, 2026-10-15). Every image in the client's
// Drive folder as a tile; tick some, Convert, and each one downloads as a JPG
// under 750 KB, ready to attach to a GHL text. Photos dropped from the computer
// convert and download straight away. Nothing is written back to Drive (Jake's
// pick: download only).
//
// Converted one at a time: each Drive read goes through Composio's metered
// proxy, and a burst of ten is what earns a 429.

type Job = {
  id: string;
  name: string;
  before: number | null;
  status: "working" | "done" | "error";
  file?: File;
  error?: string;
};

let nextId = 0;

const kb = (bytes: number) => `${Math.round(bytes / 1000).toLocaleString()} KB`;

function save(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  // Long enough for the browser to start the save before the URL dies.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function ImageConverterTab({ tenantId }: { tenantId: string }) {
  const query = useAdminDriveImagesQuery(tenantId);
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const images = useMemo(() => query.data?.images ?? [], [query.data]);
  const groups = useMemo(() => {
    const byFolder = new Map<string, DriveImage[]>();
    for (const img of images) byFolder.set(img.folder, [...(byFolder.get(img.folder) ?? []), img]);
    return [...byFolder.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [images]);

  const patch = (id: string, change: Partial<Job>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...change } : j)));

  // `load` gets the source bytes: a Drive read, or the dropped file itself.
  async function run(items: { name: string; before: number | null; load: () => Promise<Blob> }[]) {
    if (items.length === 0) return;
    const queued = items.map((it) => ({ ...it, id: `j${nextId++}` }));
    setJobs((prev) => [...queued.map(({ id, name, before }) => ({ id, name, before, status: "working" as const })), ...prev]);
    setBusy(true);
    for (const it of queued) {
      try {
        const file = await toTextingJpeg(await it.load(), it.name);
        patch(it.id, { status: "done", file, name: file.name });
        save(file);
      } catch (err) {
        patch(it.id, { status: "error", error: (err as Error).message || "Could not convert." });
      }
    }
    setBusy(false);
  }

  function convertPicked() {
    const chosen = images.filter((img) => picked.has(img.id));
    setPicked(new Set());
    void run(chosen.map((img) => ({ name: img.name, before: img.size, load: () => fetchDriveImage(tenantId, img.id) })));
  }

  function addLocal(list: FileList | null) {
    if (!list) return;
    void run(Array.from(list).map((f) => ({ name: f.name, before: f.size, load: async () => f })));
  }

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleGroup = (group: DriveImage[]) =>
    setPicked((prev) => {
      const next = new Set(prev);
      const all = group.every((g) => next.has(g.id));
      for (const g of group) {
        if (all) next.delete(g.id);
        else next.add(g.id);
      }
      return next;
    });

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[15px] font-semibold text-text">Image Converter</h2>
        {query.data?.folderUrl && (
          <a
            href={query.data.folderUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-brand"
          >
            <ExternalLink size={14} /> Drive folder
          </a>
        )}
        <button
          type="button"
          onClick={convertPicked}
          disabled={picked.size === 0 || busy}
          className="rounded-[var(--radius)] bg-brand px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {picked.size > 0 ? `Convert ${picked.size}` : "Convert"}
        </button>
      </div>

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
          addLocal(e.dataTransfer.files);
        }}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-[13px] font-medium transition-colors ${
          over ? "border-brand bg-brand/5 text-brand" : "border-border text-muted hover:border-brand hover:text-brand"
        }`}
      >
        <UploadCloud size={18} aria-hidden />
        Drop photos
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          addLocal(e.target.files);
          e.target.value = "";
        }}
      />

      {jobs.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-text">{j.name}</span>
              {j.status === "working" && <span className="text-muted">Converting...</span>}
              {j.status === "error" && <span className="font-medium text-danger">{j.error}</span>}
              {j.status === "done" && j.file && (
                <>
                  <span className="tnum text-muted">
                    {j.before ? `${kb(j.before)} → ` : ""}
                    <span className="font-semibold text-text">{kb(j.file.size)}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Download again"
                    onClick={() => j.file && save(j.file)}
                    className="text-muted transition-colors hover:text-brand"
                  >
                    <Download size={15} />
                  </button>
                </>
              )}
              {j.status !== "working" && (
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setJobs((prev) => prev.filter((x) => x.id !== j.id))}
                  className="text-muted transition-colors hover:text-text"
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        {query.isLoadingError ? (
          <ErrorNote message={(query.error as Error | null)?.message} />
        ) : query.isLoading && !query.data ? (
          <Spinner />
        ) : !query.data?.folderUrl ? (
          <div className="flex flex-col items-center gap-3 py-10 text-[13px] text-muted">
            No Drive folder yet.
            <Link to={clientPath(tenantId, "brief")} className="font-semibold text-brand hover:underline">
              Brief
            </Link>
          </div>
        ) : images.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted">No images in the Drive folder.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map(([folder, group]) => (
              <div key={folder}>
                <div className="mb-2 flex items-center gap-3">
                  <h3 className="text-[13px] font-semibold text-text">{folder || "Main folder"}</h3>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="text-[12px] font-medium text-muted transition-colors hover:text-brand"
                  >
                    {group.every((g) => picked.has(g.id)) ? "Clear" : "Select all"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {group.map((img) => (
                    <Tile key={img.id} img={img} on={picked.has(img.id)} onToggle={() => toggle(img.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Tile({ img, on, onToggle }: { img: DriveImage; on: boolean; onToggle: () => void }) {
  const [broken, setBroken] = useState(false);
  // Drive hands out 220px thumbnails; the same link serves any size.
  const thumb = img.thumbnailLink?.replace(/=s\d+$/, "=s400") ?? null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`group relative overflow-hidden rounded-lg border text-left transition-colors ${
        on ? "border-brand ring-2 ring-brand" : "border-border hover:border-brand"
      }`}
    >
      <div className="flex aspect-square items-center justify-center bg-surface-2">
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
      </div>
      <div className="px-2 py-1.5">
        <div className="truncate text-[12px] font-medium text-text">{img.name}</div>
        {img.size != null && <div className="tnum text-[11px] text-muted">{kb(img.size)}</div>}
      </div>
      {on && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
          <Check size={13} />
        </span>
      )}
    </button>
  );
}
