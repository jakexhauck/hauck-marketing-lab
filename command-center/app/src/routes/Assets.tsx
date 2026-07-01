import { useMemo, useState } from "react";
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
import { useToast } from "../context/ToastContext";
import { PAGE_CONTAINER } from "../lib/layout";
import { cn } from "../lib/cn";

// Company > Assets. The client's own file library — contracts, brand files and
// reports — served straight from a Google Drive they connect themselves
// (drive.file scope; see docs/connections/assets.md). Same golden rule as the
// Marketing sections: a real (unconnected) session never sees fabricated files.
// It shows the "Connect your Google Drive" state instead. The populated Drive
// (Variation A: folder rail + file list) renders only in demo/preview mode.
// Upload / download / new-folder are gated until the Drive backend is wired.

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

// ---------------------------------------------------------------------------
// Categories (the left rail). Counts are derived from the file list below so the
// rail can never drift from what's actually shown.
// ---------------------------------------------------------------------------
type Category = "all" | "contracts" | "brand" | "reports" | "invoices";

const CATS: { key: Category; label: string; icon: LucideIcon }[] = [
  { key: "all", label: "All files", icon: FolderOpen },
  { key: "contracts", label: "Contracts", icon: FileText },
  { key: "brand", label: "Brand assets", icon: ImageIcon },
  { key: "reports", label: "Reports", icon: FileSpreadsheet },
  { key: "invoices", label: "Invoices", icon: FileArchive },
];

const CAT_LABEL: Record<Exclude<Category, "all">, string> = {
  contracts: "Contracts",
  brand: "Brand assets",
  reports: "Reports",
  invoices: "Invoices",
};

// ---------------------------------------------------------------------------
// Demo data. One home-services client (Willis Window Cleaning). Replaced by the
// client's live Drive listing later; the shape stays the same.
// ---------------------------------------------------------------------------
interface DemoFile {
  id: string;
  name: string;
  kind: FileKind;
  cat: Exclude<Category, "all">;
  sharedBy: "you" | "agency";
  modified: string;
  size: string;
}

const DEMO_FILES: DemoFile[] = [
  { id: "msa", name: "Willis · Master Service Agreement.pdf", kind: "pdf", cat: "contracts", sharedBy: "agency", modified: "Jun 19, 2026", size: "248 KB" },
  { id: "addendum", name: "Ad management addendum.pdf", kind: "pdf", cat: "contracts", sharedBy: "agency", modified: "Jun 19, 2026", size: "102 KB" },
  { id: "logopack", name: "Willis-logo-pack.zip", kind: "zip", cat: "brand", sharedBy: "you", modified: "Jun 24, 2026", size: "18.4 MB" },
  { id: "truckwrap", name: "Truck-wrap-mockup.png", kind: "image", cat: "brand", sharedBy: "you", modified: "Jun 24, 2026", size: "3.1 MB" },
  { id: "voice", name: "Brand voice + tone.doc", kind: "doc", cat: "brand", sharedBy: "agency", modified: "Jun 20, 2026", size: "64 KB" },
  { id: "junereport", name: "June performance report.pdf", kind: "pdf", cat: "reports", sharedBy: "agency", modified: "Jul 1, 2026", size: "1.2 MB" },
  { id: "leadtracker", name: "Lead tracker.sheet", kind: "sheet", cat: "reports", sharedBy: "you", modified: "Today", size: "—" },
  { id: "inv1043", name: "May invoice · #1043.pdf", kind: "pdf", cat: "invoices", sharedBy: "agency", modified: "Jun 2, 2026", size: "88 KB" },
];

const CAT_ORDER: Exclude<Category, "all">[] = ["contracts", "brand", "reports", "invoices"];

export default function Assets() {
  const demo = demoMode();
  const { showToast } = useToast();
  const [cat, setCat] = useState<Category>("all");
  const [query, setQuery] = useState("");

  const gated = () =>
    showToast("Preview only. This turns on once your Google Drive is connected.");

  const catCount = (key: Category) =>
    key === "all" ? DEMO_FILES.length : DEMO_FILES.filter((f) => f.cat === key).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEMO_FILES.filter(
      (f) => (cat === "all" || f.cat === cat) && (!q || f.name.toLowerCase().includes(q)),
    );
  }, [cat, query]);

  // Group the "all" view by category; a filtered or single-category view is flat.
  const grouped = cat === "all" && !query.trim();

  // -------------------------------------------------------------------------
  // Real (unconnected) session: never fabricate files. Show the connect state.
  // -------------------------------------------------------------------------
  if (!demo) {
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
              title="Connect your Google Drive"
              description="Keep your contracts, brand files and reports together. Connect your Drive and pick which folders to share — you stay in control, we only ever see the files you choose."
              action={
                <div className="flex flex-col items-center gap-3">
                  <Button variant="primary" disabled>
                    Connect Google Drive (coming soon)
                  </Button>
                  <span className="text-xs text-faint">
                    We only access files you pick (Google drive.file scope).
                  </span>
                </div>
              }
            />
          </Panel>
        </div>
      </Shell>
    );
  }

  // -------------------------------------------------------------------------
  // Demo / preview: the connected Drive — folder rail + file list (Variation A).
  // -------------------------------------------------------------------------
  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageHeader
          title="Assets"
          description="Contracts, brand files and reports, shared straight from your Drive."
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

        {/* Connected banner */}
        <Panel className="mb-4 flex items-center gap-3 border-positive/30 bg-positive-tint px-4 py-2.5">
          <CheckCircle2 size={18} className="shrink-0 text-positive" />
          <div className="flex-1 text-[13px] leading-snug text-text">
            <span className="font-semibold">Google Drive connected</span>{" "}
            <span className="text-muted">· tom@williswindows.com</span>
          </div>
          <Badge tone="positive">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
            Synced 2m ago
          </Badge>
        </Panel>

        {/* Mobile category chips (rail is desktop-only) */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {CATS.map((c) => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                cat === c.key
                  ? "border-transparent bg-brand-tint text-brand-text"
                  : "border-border bg-surface text-muted hover:bg-surface-2",
              )}
            >
              {c.label}
              <span className="ml-1.5 text-faint">{catCount(c.key)}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[212px_1fr]">
          {/* Left rail — categories + storage (desktop) */}
          <div className="hidden lg:block">
            <Panel className="sticky top-2 flex flex-col p-2">
              <div className="label-cap px-2 pb-1 pt-1.5 text-faint">Library</div>
              {CATS.map((c) => {
                const Icon = c.icon;
                const on = cat === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => setCat(c.key)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] transition-colors",
                      on
                        ? "bg-brand-tint font-semibold text-brand-text"
                        : "font-medium text-text hover:bg-surface-2",
                    )}
                  >
                    <Icon size={15} className={on ? "text-brand-text" : "text-faint"} />
                    <span className="flex-1">{c.label}</span>
                    <span className={cn("text-xs", on ? "text-brand-text" : "text-faint")}>
                      {catCount(c.key)}
                    </span>
                  </button>
                );
              })}
              <div className="mt-3 border-t border-divider px-2 pb-1 pt-3">
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full"
                    style={{ width: "38%", backgroundImage: "var(--grad-brand)" }}
                  />
                </div>
                <div className="text-xs text-muted">5.7 GB of 15 GB used</div>
              </div>
            </Panel>
          </div>

          {/* Right — toolbar + file list */}
          <Panel className="min-w-0 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-divider px-4 py-3">
              <div className="min-w-0 font-display text-[15px] text-text">
                {cat === "all" ? "All files" : CAT_LABEL[cat]}
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
                description="Try a different search or category."
              />
            ) : (
              <div className="px-2 py-1.5">
                {grouped
                  ? CAT_ORDER.map((group) => {
                      const rows = filtered.filter((f) => f.cat === group);
                      if (rows.length === 0) return null;
                      return (
                        <div key={group}>
                          <div className="label-cap px-3 pb-1 pt-3 text-faint">
                            {CAT_LABEL[group]}
                          </div>
                          {rows.map((f) => (
                            <FileRow key={f.id} file={f} onAction={gated} />
                          ))}
                        </div>
                      );
                    })
                  : filtered.map((f) => <FileRow key={f.id} file={f} onAction={gated} />)}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

function FileRow({ file, onAction }: { file: DemoFile; onAction: () => void }) {
  const Icon = KIND[file.kind].icon;
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
          {file.sharedBy === "agency" ? "Shared by Hauck Marketing" : "You"}
        </div>
      </div>
      <div className="hidden w-28 shrink-0 text-[13px] text-muted sm:block">{file.modified}</div>
      <div className="hidden w-20 shrink-0 text-[13px] text-faint sm:block">{file.size}</div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100"
          aria-label="Download"
          onClick={onAction}
        >
          <Download size={15} />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More" onClick={onAction}>
          <MoreHorizontal size={16} />
        </Button>
      </div>
    </div>
  );
}
