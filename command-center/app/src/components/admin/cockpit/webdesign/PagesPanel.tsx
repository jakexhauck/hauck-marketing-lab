import { useState } from "react";
import { Globe, ChevronRight, Pencil, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Panel, EmptyState, Button } from "../../../ui";
import {
  useAdminClientDetailQuery,
  useAdminWebsitePagesQuery,
  useSaveAdminWebsitePages,
  type WebsitePageEdit,
} from "../../../../hooks/useApi";
import { DevicePreview, LiveSiteFrame, DeviceToggle } from "../../../../routes/website/shared";
import type { Device } from "../../../../routes/website/shared";

// Web Design > Pages. The client's Website > Pages list, edited here by the
// operator (name + path per row) and stored on the tenant row. The client's own
// Pages tab reads the same list. Read mode previews each page by joining its
// path onto the client's website_url; Edit mode manages the list.

const inputCls =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13.5px] text-text placeholder:text-faint transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

// The host + path shown in the desktop browser frame's address bar.
function addressLabel(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return fullUrl;
  }
}

function PageRow({
  name,
  sub,
  selected,
  onClick,
}: {
  name: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={
        "flex items-center justify-between gap-2.5 rounded-[var(--radius)] border px-3.5 py-3 text-left transition-colors duration-150 " +
        (selected
          ? "border-brand bg-brand-tint ring-1 ring-inset ring-brand"
          : "border-border bg-surface hover:border-border-strong hover:bg-surface-2")
      }
    >
      <div className="min-w-0">
        <div className="truncate font-display text-[14px] font-semibold text-text">{name}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-faint">{sub}</div>
      </div>
      <ChevronRight
        size={16}
        className={"shrink-0 transition-colors " + (selected ? "text-brand-text" : "text-faint")}
      />
    </button>
  );
}

// The list editor: a row per page (name + path) with reorder + remove, an add
// button, and Save / Cancel. Saving replaces the whole list on the tenant row.
function PagesEditor({
  tenantId,
  initial,
  onClose,
}: {
  tenantId: string;
  initial: WebsitePageEdit[];
  onClose: () => void;
}) {
  const save = useSaveAdminWebsitePages(tenantId);
  // Start with one blank row when the client has no pages yet, so the operator
  // has somewhere to type immediately.
  const [rows, setRows] = useState<WebsitePageEdit[]>(
    initial.length ? initial : [{ name: "", path: "" }],
  );
  const [err, setErr] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<WebsitePageEdit>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { name: "", path: "" }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = rs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const submit = async () => {
    setErr(null);
    // Keep only rows with both fields; the server sanitizes further (trims,
    // leading slash, caps). An all-empty list is allowed (clears the pages).
    const cleaned = rows
      .map((r) => ({ name: r.name.trim(), path: r.path.trim() }))
      .filter((r) => r.name && r.path);
    try {
      await save.mutateAsync(cleaned);
      onClose();
    } catch {
      setErr("Could not save. Please try again.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="font-display text-[15px] font-semibold text-text">Edit pages</h4>
          <p className="mt-0.5 text-[12px] text-muted">
            The list your client sees under Website. Order here is the order they see.
          </p>
        </div>
        <DeviceToggleSpacer />
      </div>

      <div className="flex flex-col gap-2">
        {/* Column captions */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 px-0.5">
          <span className="label-cap">Page name</span>
          <span className="label-cap">Path</span>
          <span className="w-[104px]" />
        </div>

        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2"
          >
            <input
              className={inputCls}
              value={r.name}
              onChange={(e) => setRow(i, { name: e.target.value })}
              placeholder="Home"
              maxLength={80}
            />
            <input
              className={inputCls}
              value={r.path}
              onChange={(e) => setRow(i, { path: e.target.value })}
              placeholder="/home"
              maxLength={200}
            />
            <div className="flex items-center gap-1">
              <IconBtn
                label="Move up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                icon={<ChevronUp size={15} />}
              />
              <IconBtn
                label="Move down"
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
                icon={<ChevronDown size={15} />}
              />
              <IconBtn
                label="Remove page"
                onClick={() => removeRow(i)}
                icon={<Trash2 size={15} />}
                danger
              />
            </div>
          </div>
        ))}
      </div>

      <div>
        <Button variant="secondary" size="sm" onClick={addRow}>
          <Plus size={15} /> Add page
        </Button>
      </div>

      {err && <p className="text-[13px] text-danger">{err}</p>}

      <div className="flex items-center gap-2 border-t border-divider pt-3">
        <Button variant="primary" size="sm" onClick={submit} disabled={save.isPending}>
          {save.isPending ? "Saving..." : "Save pages"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Keeps the header height stable between read and edit modes (edit has no device
// toggle on the right); purely cosmetic.
function DeviceToggleSpacer() {
  return <span className="h-8" aria-hidden />;
}

function IconBtn({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={
        "inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] border border-border bg-surface transition-colors disabled:opacity-40 " +
        (danger
          ? "text-muted hover:border-danger/40 hover:bg-danger-tint hover:text-danger"
          : "text-muted hover:border-border-strong hover:bg-surface-2 hover:text-text")
      }
    >
      {icon}
    </button>
  );
}

export default function PagesPanel({ tenantId }: { tenantId: string }) {
  const detailQuery = useAdminClientDetailQuery(tenantId);
  const pagesQuery = useAdminWebsitePagesQuery(tenantId);
  const [device, setDevice] = useState<Device>("desktop");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (detailQuery.isLoading || pagesQuery.isLoading) {
    return <div className="pk-empty">Loading pages...</div>;
  }
  if (pagesQuery.isError || !pagesQuery.data) {
    return <div className="pk-empty">Could not load this client's pages.</div>;
  }

  const { pages } = pagesQuery.data;
  const websiteUrl = detailQuery.data?.client.websiteUrl ?? null;
  const editable: WebsitePageEdit[] = pages.map((p) => ({ name: p.name, path: p.path }));

  if (editing) {
    return (
      <Panel className="p-4">
        <PagesEditor
          tenantId={tenantId}
          initial={editable}
          onClose={() => setEditing(false)}
        />
      </Panel>
    );
  }

  if (pages.length === 0) {
    return (
      <Panel className="px-4 py-12">
        <EmptyState
          icon={<Globe size={22} />}
          title="No pages added for this client yet"
          description="Add each page of their site (Home, About, Services, ...) so it lists in their Website tab, ready to preview and take change requests."
          action={
            <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
              <Plus size={15} /> Add pages
            </Button>
          }
        />
      </Panel>
    );
  }

  const fullUrl = (path: string): string | null => {
    if (!websiteUrl) return null;
    try {
      return new URL(path, websiteUrl).toString();
    } catch {
      return null;
    }
  };

  const selected = pages.find((p) => p.id === selectedId) ?? pages[0];
  const preview = fullUrl(selected.path);
  const barLabel = preview ? addressLabel(preview) : selected.path;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5">
        <div className="mb-1 flex items-center justify-between">
          <span className="label-cap">Pages</span>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Edit
          </Button>
        </div>
        {pages.map((p) => (
          <PageRow
            key={p.id}
            name={p.name}
            sub={p.path}
            selected={p.id === selected.id}
            onClick={() => setSelectedId(p.id)}
          />
        ))}
      </div>

      <div>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-text">{barLabel}</span>
          <DeviceToggle value={device} onChange={setDevice} />
        </div>

        {preview ? (
          <DevicePreview url={barLabel} device={device}>
            <LiveSiteFrame url={preview} device={device} />
          </DevicePreview>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface px-6 py-16 text-center">
            <Globe size={22} className="text-faint" />
            <p className="text-[13px] text-muted">
              Add this client's website address in Config to preview their pages.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
          <span>
            Address <b className="font-semibold text-text">{barLabel}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
