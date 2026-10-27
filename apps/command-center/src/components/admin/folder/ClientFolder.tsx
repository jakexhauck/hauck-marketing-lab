import { Fragment, useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  LoaderCircle,
  Music,
  Pencil,
  Plus,
  Presentation,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useAdminOnboardingDriveFolder, useClientDriveActions, useClientDriveQuery } from "../../../hooks/useApi";
import type { ClientDriveFile } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import { asGoogleAccount, driveKind, driveOpen, type DriveKind } from "../../../lib/driveOpen";
import { MissionStyle } from "../brief/missionStyle";
import { FolderStyle } from "./folderStyle";

// Client > Folder (Jake, 2026-10-26): the client's whole Drive folder in the
// app. Files open in the page (lib/driveOpen.ts), so a Doc is edited right here.
// Where you are lives in the address (?folder= and ?file=), so Back, a refresh
// and a pasted link all land in the same place.

const KIND: Record<DriveKind, { icon: LucideIcon; color: string; label: string }> = {
  folder: { icon: Folder, color: "var(--text-muted)", label: "Folder" },
  doc: { icon: FileText, color: "#4285f4", label: "Doc" },
  sheet: { icon: FileSpreadsheet, color: "#0f9d58", label: "Sheet" },
  slides: { icon: Presentation, color: "#f4b400", label: "Slides" },
  form: { icon: ClipboardList, color: "#7248b9", label: "Form" },
  pdf: { icon: FileText, color: "#db4437", label: "PDF" },
  image: { icon: ImageIcon, color: "#a142f4", label: "Image" },
  video: { icon: Film, color: "#db4437", label: "Video" },
  audio: { icon: Music, color: "#e8710a", label: "Audio" },
  file: { icon: File, color: "var(--text-muted)", label: "File" },
};

type NewKind = "folder" | "doc" | "sheet" | "slides";

// Google's own names for a fresh one, renamed from the editor's title as in Drive.
const UNTITLED = { doc: "Untitled document", sheet: "Untitled spreadsheet", slides: "Untitled presentation" } as const;

export function ClientFolder({ tenantId, brandColor }: { tenantId: string; brandColor?: string }) {
  const [params, setParams] = useSearchParams();
  const q = useClientDriveQuery(tenantId, params.get("folder"));
  const acts = useClientDriveActions(tenantId);
  // Files open as the admin's own Google account (lib/driveOpen.ts asGoogleAccount).
  const account = useAuth().admin?.email ?? null;
  const makeFolder = useAdminOnboardingDriveFolder(tenantId);
  // A file made from New, opened before the list refetch has it.
  const [made, setMade] = useState<ClientDriveFile | null>(null);
  const [uploads, setUploads] = useState<{ key: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const path = q.data?.path ?? [];
  const here = path[path.length - 1]?.id ?? null;
  const files = q.data?.files ?? [];
  const fileId = params.get("file");
  const opened = fileId ? (files.find((f) => f.id === fileId) ?? (made?.id === fileId ? made : null)) : null;
  const style = brandColor ? ({ "--brand": brandColor } as CSSProperties) : undefined;

  const go = (next: { folder?: string | null; file?: string | null }) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p);
  };

  const open = (f: ClientDriveFile) => {
    const o = driveOpen(f, account);
    if (o.kind === "folder") go({ folder: f.id, file: null });
    else if (o.kind === "external") window.open(o.url, "_blank", "noopener,noreferrer");
    else go({ file: f.id });
  };

  // Back from a file: the list refetches, so its edit time is current.
  const close = () => {
    go({ file: null });
    void acts.refresh();
  };

  const fail = (e: unknown, name?: string) => setError(name ? `${name}: ${(e as Error).message}` : (e as Error).message);

  const upload = async (list: FileList) => {
    if (!here) return;
    setError(null);
    for (const file of Array.from(list)) {
      const key = crypto.randomUUID();
      setUploads((u) => [...u, { key, name: file.name }]);
      try {
        await acts.upload.mutateAsync({ parent: here, file });
      } catch (e) {
        fail(e, file.name);
      } finally {
        setUploads((u) => u.filter((x) => x.key !== key));
      }
    }
  };

  const create = async (kind: NewKind, name?: string) => {
    if (!here) return;
    setError(null);
    if (kind === "folder" && !name) return setNaming(true);
    setNaming(false);
    try {
      const { file } = await acts.create.mutateAsync({ kind, name: name ?? UNTITLED[kind as keyof typeof UNTITLED], parent: here });
      if (kind !== "folder") {
        setMade(file);
        go({ file: file.id });
      }
    } catch (e) {
      fail(e);
    }
  };

  const onDragOver = (e: DragEvent) => {
    if (!here || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setOver(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!here) return;
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
  };

  if (opened) {
    const o = driveOpen(opened, account);
    const k = KIND[driveKind(opened.mimeType)];
    return (
      <div className="mcb cf" style={style}>
        <MissionStyle />
        <FolderStyle />
        <div className="mcb-head">
          <button type="button" className="mcb-btn" onClick={close} aria-label="Back" title="Back">
            <ArrowLeft size={14} />
          </button>
          <span className="cf-ic">
            <k.icon size={16} style={{ color: k.color }} />
          </span>
          <h2 className="cf-file">{opened.name}</h2>
          <span className="mcb-grow" />
          <a
            className="mcb-btn"
            href={opened.webViewLink ? asGoogleAccount(opened.webViewLink, account) : o.kind === "embed" ? o.url : "#"}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in Google"
            title="Open in Google"
          >
            <ExternalLink size={14} />
          </a>
        </div>
        {o.kind === "embed" && (
          <iframe
            key={opened.id}
            title={opened.name}
            src={o.url}
            className="cf-doc"
            allow="autoplay; fullscreen; clipboard-read; clipboard-write"
          />
        )}
      </div>
    );
  }

  const busyId = (acts.rename.isPending && acts.rename.variables?.id) || (acts.trash.isPending && acts.trash.variables) || null;

  return (
    <div className={`mcb cf${over ? " cf-over" : ""}`} style={style} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <MissionStyle />
      <FolderStyle />
      <div className="mcb-head">
        <h2 className="mcb-title">Folder</h2>
        <span className="mcb-grow" />
        {here && (
          <>
            <NewMenu busy={acts.create.isPending} onPick={(k) => void create(k)} />
            <button type="button" className="mcb-btn" onClick={() => picker.current?.click()}>
              <Upload size={14} /> Upload
            </button>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) void upload(e.target.files);
                e.target.value = "";
              }}
            />
            <a
              className="mcb-btn"
              href={`https://drive.google.com/drive/folders/${here}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in Google Drive"
              title="Open in Google Drive"
            >
              <ExternalLink size={14} />
            </a>
          </>
        )}
      </div>

      {path.length > 0 && (
        <nav className="cf-crumbs" aria-label="Folder path">
          {path.map((s, i) => (
            <Fragment key={s.id}>
              {i > 0 && <ChevronRight size={14} className="cf-sep" />}
              {i === path.length - 1 ? (
                <span className="cf-crumb on">{s.name}</span>
              ) : (
                <button type="button" className="cf-crumb" onClick={() => go({ folder: i === 0 ? null : s.id, file: null })}>
                  {s.name}
                </button>
              )}
            </Fragment>
          ))}
        </nav>
      )}

      {error && <div className="cf-err">{error}</div>}

      {q.isLoading ? (
        <div className="mcb-empty">Loading...</div>
      ) : q.isError ? (
        <div className="mcb-card">
          <div className="mcb-empty">{(q.error as Error).message}</div>
          {params.get("folder") && (
            <button type="button" className="mcb-btn" onClick={() => go({ folder: null, file: null })}>
              Top folder
            </button>
          )}
        </div>
      ) : !q.data?.root ? (
        <div className="mcb-card">
          <div className="mcb-empty">No Drive folder.</div>
          <button
            type="button"
            className="mcb-btn"
            disabled={makeFolder.isPending}
            onClick={() => makeFolder.mutate(undefined, { onSuccess: () => void acts.refresh(), onError: (e) => fail(e) })}
          >
            {makeFolder.isPending ? "Creating..." : "Create client folder"}
          </button>
        </div>
      ) : (
        <div className="mcb-card cf-list">
          {naming && (
            <div className="cf-row">
              <span className="cf-main">
                <span className="cf-ic">
                  <Folder size={18} style={{ color: KIND.folder.color }} />
                </span>
                <NameInput initial="New folder" onDone={(name) => (name ? void create("folder", name) : setNaming(false))} />
              </span>
            </div>
          )}
          {uploads.map((u) => (
            <div key={u.key} className="cf-row">
              <span className="cf-main">
                <span className="cf-ic">
                  <LoaderCircle size={16} className="cf-spin" />
                </span>
                <span className="cf-name">{u.name}</span>
              </span>
              <span className="cf-kind">Uploading</span>
            </div>
          ))}
          {files.map((f) => (
            <Row
              key={f.id}
              f={f}
              busy={busyId === f.id}
              shownName={acts.rename.isPending && acts.rename.variables?.id === f.id ? acts.rename.variables.name : f.name}
              onOpen={() => open(f)}
              onRename={(name) => acts.rename.mutate({ id: f.id, name }, { onError: (e) => fail(e, f.name) })}
              onTrash={() => acts.trash.mutate(f.id, { onError: (e) => fail(e, f.name) })}
            />
          ))}
          {files.length === 0 && uploads.length === 0 && !naming && <div className="mcb-empty">Empty.</div>}
        </div>
      )}
    </div>
  );
}

function Row({
  f,
  busy,
  shownName,
  onOpen,
  onRename,
  onTrash,
}: {
  f: ClientDriveFile;
  busy: boolean;
  shownName: string;
  onOpen: () => void;
  onRename: (name: string) => void;
  onTrash: () => void;
}) {
  const kind = driveKind(f.mimeType);
  const k = KIND[kind];
  const [editing, setEditing] = useState(false);
  // Delete takes two clicks: the first arms it for three seconds.
  const [armed, setArmed] = useState(false);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const thumb = (kind === "image" || kind === "video") && f.thumbnailLink && !broken ? f.thumbnailLink : null;
  const icon = thumb ? (
    <img className="cf-thumb" src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  ) : (
    <span className="cf-ic">
      <k.icon size={18} style={{ color: k.color }} />
    </span>
  );

  return (
    <div className={`cf-row${busy ? " busy" : ""}`}>
      {editing ? (
        <span className="cf-main">
          {icon}
          <NameInput
            initial={f.name}
            saveOnBlur
            onDone={(name) => {
              setEditing(false);
              if (name && name !== f.name) onRename(name);
            }}
          />
        </span>
      ) : (
        <button type="button" className="cf-main" onClick={onOpen}>
          {icon}
          <span className="cf-name">{shownName}</span>
        </button>
      )}
      <span className="cf-kind">{k.label}</span>
      <span className="cf-when">{when(f.modifiedTime)}</span>
      <span className="cf-acts">
        <button type="button" className="cf-act" aria-label="Rename" title="Rename" onClick={() => setEditing(true)}>
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className={`cf-act${armed ? " arm" : ""}`}
          aria-label={armed ? "Confirm delete" : "Delete"}
          title={armed ? "Confirm delete" : "Delete"}
          onClick={() => {
            if (!armed) return setArmed(true);
            setArmed(false);
            onTrash();
          }}
        >
          {armed ? "Delete" : <Trash2 size={14} />}
        </button>
      </span>
    </div>
  );
}

function NameInput({
  initial,
  saveOnBlur = false,
  onDone,
}: {
  initial: string;
  saveOnBlur?: boolean;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name?.trim() || null);
  };
  return (
    <input
      className="cf-input"
      autoFocus
      value={value}
      aria-label="Name"
      onChange={(e) => setValue(e.target.value)}
      // The name without its extension is selected, as Drive does.
      onFocus={(e) => {
        const dot = initial.lastIndexOf(".");
        e.target.setSelectionRange(0, dot > 0 ? dot : initial.length);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(value);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={() => finish(saveOnBlur ? value : null)}
    />
  );
}

function NewMenu({ busy, onPick }: { busy: boolean; onPick: (kind: NewKind) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="cf-new" ref={ref}>
      <button type="button" className="mcb-btn" disabled={busy} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {busy ? <LoaderCircle size={14} className="cf-spin" /> : <Plus size={14} />} New
      </button>
      {open && (
        <div className="cf-menu" role="menu">
          {(["folder", "doc", "sheet", "slides"] as const).map((kind) => {
            const k = KIND[kind];
            return (
              <button
                key={kind}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(kind);
                }}
              >
                <k.icon size={15} style={{ color: k.color }} /> {k.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// "2:14 PM" today, "Oct 26" this year, "Oct 26, 2025" before that.
function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString(
    [],
    d.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" },
  );
}
