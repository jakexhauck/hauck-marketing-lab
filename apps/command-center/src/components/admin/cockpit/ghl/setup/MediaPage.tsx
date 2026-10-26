import { useRef, useState } from "react";
import { Check, ChevronRight, Folder, FolderPlus, Grid2x2, Image as ImageIcon, List, Upload } from "lucide-react";
import { cn } from "../../../../../lib/cn";
import { SopButton, SOP_FIELD } from "../../../sop/sopKit";
import { useAdminDriveImagesQuery } from "../../../../../hooks/useApi";
import { useGhlMedia, useGhlMediaFolder, useGhlMediaUpload } from "../../../../../hooks/useGhlSetup";
import type { MediaItem } from "../../../../../../functions/lib/ghlSetup";
import { Chip, Drawer, ErrorLine, GhlPage, OpenInGhl, PageState, Search, TD } from "./kit";

// GHL Media Storage: breadcrumb, New Folder, Upload, grid or list. Plus Import
// from Drive, because checklist B1 is "upload the logo and job photos" and they
// already sit in the client's Drive folder.

const IMG = /\.(png|jpe?g|gif|webp|svg|heic)$/i;
const size = (n: number | null) => (n === null ? "" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

function Thumb({ item, className }: { item: MediaItem; className?: string }) {
  if (item.type === "folder") {
    return (
      <div className={cn("grid place-items-center bg-surface-2 text-faint", className)}>
        <Folder size={26} aria-hidden />
      </div>
    );
  }
  if (item.url && IMG.test(item.name)) return <img src={item.url} alt="" loading="lazy" className={cn("object-cover", className)} />;
  return (
    <div className={cn("grid place-items-center bg-surface-2 text-faint", className)}>
      <ImageIcon size={22} aria-hidden />
    </div>
  );
}

export default function MediaPage({ tenantId, locationId }: { tenantId: string; locationId: string }) {
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const parentId = path[path.length - 1]?.id ?? "";
  const q = useGhlMedia(tenantId, parentId);
  const upload = useGhlMediaUpload(tenantId);
  const newFolder = useGhlMediaFolder(tenantId);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!q.data) return <PageState title="Media Storage" loading={q.isLoading} error={q.error} />;
  const items = [...q.data.folders, ...q.data.files].filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
  const open = (f: MediaItem) => (f.type === "folder" ? setPath((p) => [...p, { id: f.id, name: f.name }]) : window.open(f.url, "_blank", "noopener"));

  const uploadFiles = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) await upload.mutateAsync({ file, parentId }).catch(() => undefined);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <GhlPage
      title="Media Storage"
      status={!path.length && <Chip tone={q.data.files.length ? "ok" : "warn"}>{q.data.files.length ? `${q.data.files.length} files` : "No logo or job photos"}</Chip>}
      actions={
        <>
          <SopButton onClick={() => setImporting(true)}>Import from Drive</SopButton>
          <OpenInGhl locationId={locationId} path="media-storage" />
          <SopButton onClick={() => setFolderName("")}>
            <FolderPlus size={13} aria-hidden /> New Folder
          </SopButton>
          <SopButton primary disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
            <Upload size={13} aria-hidden /> {upload.isPending ? "Uploading..." : "Upload"}
          </SopButton>
          <input ref={fileInput} type="file" multiple accept="image/*,video/*,application/pdf" className="hidden" onChange={(e) => void uploadFiles(e.target.files)} />
        </>
      }
    >
      <ErrorLine error={upload.error ?? newFolder.error} />
      {folderName !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <input autoFocus className={`${SOP_FIELD} w-[260px] py-1.5`} placeholder="Folder name" value={folderName} onChange={(e) => setFolderName(e.target.value)} />
          <SopButton onClick={() => setFolderName(null)}>Cancel</SopButton>
          <SopButton primary disabled={!folderName.trim() || newFolder.isPending} onClick={() => newFolder.mutate({ name: folderName.trim(), parentId }, { onSuccess: () => setFolderName(null) })}>
            Create
          </SopButton>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <span className="flex flex-wrap items-center gap-1 text-[13px] font-semibold">
            <button type="button" onClick={() => setPath([])} className={path.length ? "text-muted hover:text-text" : "text-text"}>
              Home
            </button>
            {path.map((p, i) => (
              <span key={p.id} className="flex items-center gap-1">
                <ChevronRight size={13} className="text-faint" aria-hidden />
                <button type="button" onClick={() => setPath((x) => x.slice(0, i + 1))} className={i === path.length - 1 ? "text-text" : "text-muted hover:text-text"}>
                  {p.name}
                </button>
              </span>
            ))}
          </span>
          <div className="flex items-center gap-2">
            <Search value={search} onChange={setSearch} placeholder="Search files" />
            <div className="flex overflow-hidden rounded-[var(--radius)] border border-border">
              {(["grid", "list"] as const).map((v) => (
                <button key={v} type="button" aria-label={v} onClick={() => setView(v)} className={cn("px-2 py-1.5", view === v ? "bg-brand text-brand-fg" : "text-muted hover:text-text")}>
                  {v === "grid" ? <Grid2x2 size={14} aria-hidden /> : <List size={14} aria-hidden />}
                </button>
              ))}
            </div>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted">Empty</div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-6">
            {items.map((f) => (
              <button key={f.id} type="button" onClick={() => open(f)} className="overflow-hidden rounded-lg border border-border text-left hover:border-brand">
                <Thumb item={f} className="aspect-square w-full" />
                <div className="truncate px-2 py-1.5 text-[12px] font-semibold text-text" title={f.name}>
                  {f.name}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody className="divide-y divide-border">
              {items.map((f) => (
                <tr key={f.id} onClick={() => open(f)} className="cursor-pointer hover:bg-surface-2">
                  <td className={TD}>
                    <span className="flex items-center gap-2.5">
                      <Thumb item={f} className="h-8 w-8 rounded-[var(--radius)]" />
                      <span className="font-semibold">{f.name}</span>
                    </span>
                  </td>
                  <td className={`${TD} text-muted`}>{size(f.size)}</td>
                  <td className={`${TD} text-muted`}>{date(f.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {importing && <DriveImport tenantId={tenantId} parentId={parentId} have={new Set(q.data.files.map((f) => f.name))} onClose={() => setImporting(false)} />}
    </GhlPage>
  );
}

function DriveImport({ tenantId, parentId, have, onClose }: { tenantId: string; parentId: string; have: Set<string>; onClose: () => void }) {
  const drive = useAdminDriveImagesQuery(tenantId);
  const upload = useGhlMediaUpload(tenantId);
  const [picked, setPicked] = useState<string[]>([]);
  const images = drive.data?.images ?? [];

  return (
    <Drawer
      open
      wide
      title="Import from Drive"
      onClose={onClose}
      footer={
        <>
          <SopButton onClick={onClose}>Cancel</SopButton>
          <SopButton primary disabled={!picked.length || upload.isPending} onClick={() => upload.mutate({ driveFileIds: picked, parentId }, { onSuccess: onClose })}>
            <Upload size={13} aria-hidden /> {upload.isPending ? "Uploading..." : `Upload ${picked.length || ""}`}
          </SopButton>
        </>
      }
    >
      <ErrorLine error={upload.error ?? drive.error} />
      {drive.isLoading ? (
        <div className="py-10 text-center text-[13px] text-muted">Loading...</div>
      ) : !drive.data?.folderUrl ? (
        <div className="py-10 text-center text-[13px] text-muted">No Drive folder</div>
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <SopButton onClick={() => setPicked(images.filter((i) => !have.has(i.name)).slice(0, 20).map((i) => i.id))}>Select all</SopButton>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img) => {
              const on = picked.includes(img.id);
              const done = have.has(img.name);
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== img.id) : [...p, img.id]))}
                  className={cn("relative overflow-hidden rounded-lg border-2 text-left", on ? "border-brand" : "border-border")}
                >
                  {img.thumbnailLink ? (
                    <img src={img.thumbnailLink} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className="grid aspect-[4/3] w-full place-items-center bg-surface-2 text-faint">
                      <ImageIcon size={22} aria-hidden />
                    </div>
                  )}
                  {on && (
                    <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-brand text-brand-fg">
                      <Check size={12} strokeWidth={3} aria-hidden />
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <span className="truncate text-[12px] font-semibold text-text" title={img.folder ? `${img.folder} / ${img.name}` : img.name}>
                      {img.name}
                    </span>
                    {done && <Chip tone="ok">In GHL</Chip>}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Drawer>
  );
}
