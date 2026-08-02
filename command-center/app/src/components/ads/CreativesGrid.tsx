import { useState } from "react";
import { FileText, Film, Image as ImageIcon, Sheet, FileArchive, File } from "lucide-react";
import type { CreativeFile, CreativeKind } from "../../lib/api";

// The creatives grid: what is actually inside the client's Drive folder.
//
// Rendered by BOTH the client's own Creatives page and the admin cockpit's Paid
// Ads > Creatives tab. Each tile opens the file in Drive; nothing is edited
// here, because Drive is where these are made and a second editor is a second
// source of truth.

const KIND_ICON: Record<CreativeKind, typeof File> = {
  image: ImageIcon,
  video: Film,
  pdf: FileText,
  sheet: Sheet,
  zip: FileArchive,
  doc: File,
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
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

function formatModified(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// One tile. The preview is fetched through our own route, so it can fail for
// ordinary reasons (thumbnail not generated yet, Drive hiccup). When it does the
// tile falls back to the type icon rather than showing a broken image.
function Tile({ file }: { file: CreativeFile }) {
  const [broken, setBroken] = useState(false);
  const Icon = KIND_ICON[file.kind] ?? File;
  const showPreview = Boolean(file.thumbnailUrl) && !broken;

  return (
    <a
      href={file.webViewLink ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-brand"
      title={file.name}
    >
      <div className="relative flex aspect-[4/3] items-center justify-center bg-surface-2">
        {showPreview ? (
          // Google's own thumbnail URL, loaded straight from Drive. It is
          // short-lived and can refuse us, hence the icon fallback below rather
          // than a broken image.
          <img
            src={file.thumbnailUrl!}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <Icon size={26} className="text-faint" aria-hidden />
        )}

        {/* Video is the one kind whose thumbnail is indistinguishable from a
            photo, so it says so. */}
        {file.kind === "video" && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Video
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <span className="truncate text-[12.5px] font-medium text-text group-hover:text-brand">
          {file.name}
        </span>
        <span className="text-[11px] text-faint tnum">
          {[formatSize(file.size), formatModified(file.modifiedTime)].filter(Boolean).join(" · ")}
        </span>
      </div>
    </a>
  );
}

export default function CreativesGrid({
  files,
  connected,
  error,
  hasFolder,
  quiet = false,
}: {
  files: CreativeFile[];
  // False means the agency Google account is not connected in Composio. Distinct
  // from an empty folder, and said differently, because one is a setup step and
  // the other is just an empty folder.
  connected: boolean;
  error: string | null;
  hasFolder: boolean;
  // Suppress the not-connected notice when the caller is already showing a
  // connect button of its own, so the operator is not told twice.
  quiet?: boolean;
}) {
  if (!hasFolder) return null;

  if (!connected) {
    if (quiet) return null;
    return (
      <p className="mt-5 rounded-lg border border-border bg-surface px-4 py-3 text-[13px] text-muted">
        The folder link works, but we cannot list what is inside it yet: the agency Google account
        is not connected.
      </p>
    );
  }

  if (error) {
    return (
      <p className="mt-5 rounded-lg border border-danger/30 bg-danger-tint px-4 py-3 text-[13px] text-danger">
        Could not read the folder. {error}
      </p>
    );
  }

  if (files.length === 0) {
    return (
      <p className="mt-5 rounded-lg border border-border bg-surface px-4 py-3 text-[13px] text-muted">
        This folder is empty.
      </p>
    );
  }

  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {files.map((f) => (
        <Tile key={f.id} file={f} />
      ))}
    </div>
  );
}
