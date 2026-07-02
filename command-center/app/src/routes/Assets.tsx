import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FolderOpen,
  FileText,
  Image as ImageIcon,
  FileArchive,
  FileSpreadsheet,
  Search,
  Upload,
  FolderPlus,
  Download,
  MoreHorizontal,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import Shell from "../components/Shell";
import { PageHeader } from "../components/PageHeader";
import { Panel, Button, Badge, EmptyState } from "../components/ui";
import { demoMode } from "../demo/demoMode";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { PAGE_CONTAINER } from "../lib/layout";
import { cn } from "../lib/cn";

// Company > Assets. The client's file library: contracts, brand files and
// reports the agency shares from its Google Drive (the agency owns the Drive;
// who-sees-what is gated in our own tables, see functions/lib/clientAssets.ts).
// A real session reads GET /api/assets/files; upload / new-folder stay disabled
// because the client cannot write to the agency Drive. Demo/preview renders the
// hand-authored library below. A real session never shows fabricated files: it
// shows "not connected" or "nothing shared yet" instead.

// ---------------------------------------------------------------------------
// File-type styling. Each kind maps to a semantic tone tint (no hardcoded hex),
// so the icons stay on-brand and theme-correct in light and dark.
// ---------------------------------------------------------------------------
type FileKind = "pdf" | "doc" | "image" | "zip" | "sheet";

const KIND: Record<FileKind, { icon: LucideIcon; tint: string }> = {
  pdf: { icon: FileText, tint: "bg-danger-tint text-danger" },
  doc: { icon: FileText, tint: "bg-surface-2 text-muted" },
  image: { icon: ImageIcon, tint: "bg-brand-tint text-brand-text" },
  zip: { icon: FileArchive, tint: "bg-warning-tint text-warning" },
  sheet: { icon: FileSpreadsheet, tint: "bg-positive-tint text-positive" },
};

// The one shape the rail + list render, whether the data is demo or live. `group`
// is the section a file sits under: a category in demo, the shared folder name in
// a live session. `downloadId` is set for live files and enables a real download.
interface LibFile {
  id: string;
  name: string;
  kind: FileKind;
  group: string;
  sharedByAgency: boolean;
  modified: string;
  size: string;
  downloadId?: string;
}

// ---------------------------------------------------------------------------
// Demo data. One home-services client (Willis Window Cleaning). A live session
// replaces this with the agency-shared Drive listing; the shape stays the same.
// ---------------------------------------------------------------------------
const DEMO_FILES: LibFile[] = [
  { id: "msa", name: "Willis · Master Service Agreement.pdf", kind: "pdf", group: "Contracts", sharedByAgency: true, modified: "Jun 19, 2026", size: "248 KB" },
  { id: "addendum", name: "Ad management addendum.pdf", kind: "pdf", group: "Contracts", sharedByAgency: true, modified: "Jun 19, 2026", size: "102 KB" },
  { id: "logopack", name: "Willis-logo-pack.zip", kind: "zip", group: "Brand assets", sharedByAgency: false, modified: "Jun 24, 2026", size: "18.4 MB" },
  { id: "truckwrap", name: "Truck-wrap-mockup.png", kind: "image", group: "Brand assets", sharedByAgency: false, modified: "Jun 24, 2026", size: "3.1 MB" },
  { id: "voice", name: "Brand voice + tone.doc", kind: "doc", group: "Brand assets", sharedByAgency: true, modified: "Jun 20, 2026", size: "64 KB" },
  { id: "junereport", name: "June performance report.pdf", kind: "pdf", group: "Reports", sharedByAgency: true, modified: "Jul 1, 2026", size: "1.2 MB" },
  { id: "leadtracker", name: "Lead tracker.sheet", kind: "sheet", group: "Reports", sharedByAgency: false, modified: "Today", size: "48 KB" },
  { id: "inv1043", name: "May invoice · #1043.pdf", kind: "pdf", group: "Invoices", sharedByAgency: true, modified: "Jun 2, 2026", size: "88 KB" },
];

// ---------------------------------------------------------------------------
// Live feed shapes + formatting.
// ---------------------------------------------------------------------------
interface ApiAssetFile {
  id: string;
  name: string;
  kind: FileKind;
  section: string;
  modifiedTime: string | null;
  size: string | null;
}
interface AssetsResponse {
  connected: boolean;
  sections: string[];
  files: ApiAssetFile[];
}

function formatSize(bytes: string | null): string {
  const n = bytes ? Number(bytes) : NaN;
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
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

function mapLive(f: ApiAssetFile): LibFile {
  return {
    id: f.id,
    name: f.name,
    kind: f.kind,
    group: f.section,
    sharedByAgency: true,
    modified: formatModified(f.modifiedTime),
    size: formatSize(f.size),
    downloadId: f.id,
  };
}

const ALL = "all";

export default function Assets() {
  const demo = demoMode();
  const { showToast } = useToast();
  const [group, setGroup] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["assets-files"],
    enabled: !demo,
    staleTime: 30_000,
    queryFn: () => api<AssetsResponse>("/api/assets/files"),
  });

  const gated = () =>
    showToast("Uploading is managed by your Hauck Marketing team.");

  // The active library: demo files, or the agency-shared files for a live session.
  const files: LibFile[] = demo ? DEMO_FILES : (data?.files ?? []).map(mapLive);
  const connected = demo ? true : (data?.connected ?? false);
  const hasFiles = files.length > 0;

  // The rail groups, in first-seen order, driven entirely by the active files so
  // the rail can never drift from what is actually shown.
  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const f of files) if (!seen.includes(f.group)) seen.push(f.group);
    return seen;
  }, [files]);

  const groupCount = (key: string) =>
    key === ALL ? files.length : files.filter((f) => f.group === key).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter(
      (f) => (group === ALL || f.group === group) && (!q || f.name.toLowerCase().includes(q)),
    );
  }, [files, group, query]);

  // Group the "all" view by section; a filtered or single-section view is flat.
  const grouped = group === ALL && !query.trim();

  // -------------------------------------------------------------------------
  // Live session with nothing to show: never fabricate files. Show the reason.
  // -------------------------------------------------------------------------
  if (!demo && !hasFiles) {
    const title = connected ? "Nothing shared yet" : "Your files are on the way";
    const description = connected
      ? "Your Hauck Marketing team has not shared any files with you yet. Contracts, brand files and reports will appear here as soon as they do."
      : "Your contracts, brand files and reports will live here. Your Hauck Marketing team is getting your library set up.";
    return (
      <Shell>
        <div className={PAGE_CONTAINER}>
          <PageHeader
            title="Assets"
            description="Your contracts, brand files and reports in one place."
          />
          <Panel className="mt-2">
            <EmptyState
              icon={<FolderOpen size={22} className="text-brand-text" />}
              title={isLoading ? "Loading your files…" : title}
              description={isLoading ? "One moment." : description}
            />
          </Panel>
        </div>
      </Shell>
    );
  }

  // -------------------------------------------------------------------------
  // Populated library: folder rail + file list (Variation A).
  // -------------------------------------------------------------------------
  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageHeader
          title="Assets"
          description="Contracts, brand files and reports, shared by your Hauck Marketing team."
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={gated}>
                <FolderPlus size={15} />
                New folder
              </Button>
              <Button variant="primary" size="sm" onClick={gated}>
                <Upload size={15} />
                Upload
              </Button>
            </>
          }
        />

        {/* Shared-by banner */}
        <Panel className="mb-4 flex items-center gap-3 border-positive/30 bg-positive-tint px-4 py-2.5">
          <CheckCircle2 size={18} className="shrink-0 text-positive" />
          <div className="flex-1 text-[13px] leading-snug text-text">
            <span className="font-semibold">Shared by Hauck Marketing</span>{" "}
            <span className="text-muted">· {files.length} {files.length === 1 ? "file" : "files"}</span>
          </div>
          <Badge tone="positive">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
            Live
          </Badge>
        </Panel>

        {/* Mobile section chips (rail is desktop-only) */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {[ALL, ...groups].map((key) => (
            <button
              key={key}
              onClick={() => setGroup(key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                group === key
                  ? "border-transparent bg-brand-tint text-brand-text"
                  : "border-border bg-surface text-muted hover:bg-surface-2",
              )}
            >
              {key === ALL ? "All files" : key}
              <span className="ml-1.5 text-faint">{groupCount(key)}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[212px_1fr]">
          {/* Left rail — sections (desktop) */}
          <div className="hidden lg:block">
            <Panel className="sticky top-2 flex flex-col p-2">
              <div className="label-cap px-2 pb-1 pt-1.5 text-faint">Library</div>
              {[ALL, ...groups].map((key) => {
                const on = group === key;
                const Icon = key === ALL ? FolderOpen : FileText;
                return (
                  <button
                    key={key}
                    onClick={() => setGroup(key)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] transition-colors",
                      on
                        ? "bg-brand-tint font-semibold text-brand-text"
                        : "font-medium text-text hover:bg-surface-2",
                    )}
                  >
                    <Icon size={15} className={on ? "text-brand-text" : "text-faint"} />
                    <span className="flex-1 truncate">{key === ALL ? "All files" : key}</span>
                    <span className={cn("text-xs", on ? "text-brand-text" : "text-faint")}>
                      {groupCount(key)}
                    </span>
                  </button>
                );
              })}
            </Panel>
          </div>

          {/* Right — toolbar + file list */}
          <Panel className="min-w-0 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-divider px-4 py-3">
              <div className="min-w-0 font-display text-[15px] text-text">
                {group === ALL ? "All files" : group}
                <span className="ml-2 text-[13px] font-normal text-faint">
                  {filtered.length} {filtered.length === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2.5 py-1.5">
                <Search size={14} className="text-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search files…"
                  className="w-32 bg-transparent text-[13px] text-text placeholder:text-faint focus:outline-none sm:w-44"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={<Search size={22} />}
                title="No files match"
                description="Try a different search or section."
              />
            ) : (
              <div className="px-2 py-1.5">
                {grouped
                  ? groups.map((g) => {
                      const rows = filtered.filter((f) => f.group === g);
                      if (rows.length === 0) return null;
                      return (
                        <div key={g}>
                          <div className="label-cap px-3 pb-1 pt-3 text-faint">{g}</div>
                          {rows.map((f) => (
                            <FileRow key={f.id} file={f} onGated={gated} />
                          ))}
                        </div>
                      );
                    })
                  : filtered.map((f) => <FileRow key={f.id} file={f} onGated={gated} />)}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

function FileRow({ file, onGated }: { file: LibFile; onGated: () => void }) {
  const Icon = KIND[file.kind].icon;
  const downloadHref = file.downloadId
    ? `/api/assets/download?fileId=${encodeURIComponent(file.downloadId)}`
    : null;
  return (
    <div className="group flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 hover:bg-surface-2">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
          KIND[file.kind].tint,
        )}
      >
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[13.5px] text-text">{file.name}</div>
        <div className="text-xs text-faint">
          {file.sharedByAgency ? "Shared by Hauck Marketing" : "You"}
        </div>
      </div>
      <div className="hidden w-28 shrink-0 text-[13px] text-muted sm:block">{file.modified}</div>
      <div className="hidden w-20 shrink-0 text-[13px] text-faint sm:block">{file.size}</div>
      <div className="flex shrink-0 items-center gap-1">
        {downloadHref ? (
          <a
            href={downloadHref}
            download
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-muted opacity-0 transition-colors hover:bg-surface-3 group-hover:opacity-100"
            aria-label="Download"
          >
            <Download size={15} />
          </a>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100"
            aria-label="Download"
            onClick={onGated}
          >
            <Download size={15} />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More" onClick={onGated}>
          <MoreHorizontal size={16} />
        </Button>
      </div>
    </div>
  );
}
