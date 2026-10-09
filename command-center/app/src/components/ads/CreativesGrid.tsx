import { useState } from "react";
import { Film, Image as ImageIcon, Play, Trash2 } from "lucide-react";
import type { AdCreativeFile } from "../../lib/api";
import CreativeViewer from "./CreativeViewer";

// The creatives grid: what has been uploaded for this client.
//
// Rendered by BOTH the client's own Creatives page and the admin cockpit's Paid
// Ads > Creatives tab. A tile opens the creative in the in-app viewer. Only the
// cockpit passes onDelete.

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Preview({ file }: { file: AdCreativeFile }) {
  const [broken, setBroken] = useState(false);
  const Icon = file.kind === "video" ? Film : ImageIcon;
  if (!file.url || broken) return <Icon size={26} className="text-faint" aria-hidden />;
  if (file.kind === "video") {
    // #t=0.1 makes the browser paint the first frame as the poster.
    return (
      <video
        src={`${file.url}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        onError={() => setBroken(true)}
        className="pointer-events-none h-full w-full object-cover"
      />
    );
  }
  return (
    <img
      src={file.url}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  );
}

function Tile({
  file,
  onOpen,
  onDelete,
  deleting,
}: {
  file: AdCreativeFile;
  onOpen: () => void;
  onDelete?: () => void;
  deleting: boolean;
}) {
  // Two clicks to delete: the first arms it, the second does it.
  const [armed, setArmed] = useState(false);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-brand">
      <button type="button" onClick={onOpen} className="flex flex-col text-left" title={file.name}>
        <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden bg-surface-2">
          <Preview file={file} />
          {file.kind === "video" && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/55 p-2.5 text-white">
                <Play size={18} fill="currentColor" aria-hidden />
              </span>
            </span>
          )}
        </div>
        <div className="flex w-full flex-col gap-0.5 px-3 py-2.5">
          <span className="line-clamp-2 break-words text-[13px] font-medium leading-snug text-text group-hover:text-brand">
            {file.name}
          </span>
          <span className="text-[12px] text-faint tnum">
            {[formatSize(file.size), formatDate(file.createdAt)].filter(Boolean).join(" · ")}
          </span>
        </div>
      </button>

      {onDelete && (
        <button
          type="button"
          disabled={deleting}
          onClick={() => (armed ? onDelete() : setArmed(true))}
          onMouseLeave={() => setArmed(false)}
          aria-label={armed ? "Confirm delete" : "Delete"}
          className={`absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold transition-opacity disabled:opacity-50 ${
            armed
              ? "bg-danger text-white opacity-100"
              : "bg-black/60 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          }`}
        >
          <Trash2 size={13} aria-hidden />
          {armed && (deleting ? "Deleting" : "Delete")}
        </button>
      )}
    </div>
  );
}

export default function CreativesGrid({
  files,
  onDelete,
  deletingId,
}: {
  files: AdCreativeFile[];
  onDelete?: (id: string) => void;
  deletingId?: string | null;
}) {
  const [open, setOpen] = useState<number | null>(null);

  if (files.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-3 text-[13px] text-muted">No creatives yet.</p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {files.map((f, i) => (
          <Tile
            key={f.id}
            file={f}
            onOpen={() => setOpen(i)}
            onDelete={onDelete ? () => onDelete(f.id) : undefined}
            deleting={deletingId === f.id}
          />
        ))}
      </div>
      {open != null && files[open] && (
        <CreativeViewer files={files} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
