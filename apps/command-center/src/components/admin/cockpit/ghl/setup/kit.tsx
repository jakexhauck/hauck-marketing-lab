import { useEffect, useState, type ReactNode } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { cn } from "../../../../../lib/cn";
import { SopButton, SOP_FIELD } from "../../../sop/sopKit";

// Client > GHL setup pages (Jake, 2026-10-26: "exactly look like the page
// native in ghl, just with our design"). Each page copies the layout of the GHL
// screen it changes (its cards, tabs, tables and drawers) in Command Center
// tokens, and reads and writes the client's real sub-account
// (hooks/useGhlSetup.ts, functions/lib/ghlSetup.ts). The setup steps behind
// them are the Mission Control GHL Setup tab
// (agency/grok-bots/ghl/knowledge/ghl-new-client-setup.md).

export type Tone = "ok" | "warn" | "bad" | "info" | "idle";

const TONE: Record<Tone, string> = {
  ok: "bg-positive-tint text-positive",
  warn: "bg-warning-tint text-warning",
  bad: "bg-danger-tint text-danger",
  info: "bg-info-tint text-info",
  idle: "bg-surface-2 text-muted",
};

export function Chip({ tone = "idle", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold", TONE[tone])}>
      {children}
    </span>
  );
}

// The GHL screen a mockup stands in for. app.gohighlevel.com works for every
// sub-account the agency owns, white label or not.
export function ghlUrl(locationId: string, path: string): string {
  return `https://app.gohighlevel.com/v2/location/${encodeURIComponent(locationId || "LOCATION")}/${path}`;
}

export function OpenInGhl({ locationId, path, label = "Open in GHL" }: { locationId: string; path: string; label?: string }) {
  return (
    <a
      href={ghlUrl(locationId, path)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text transition-colors hover:border-brand"
    >
      <ExternalLink size={13} aria-hidden /> {label}
    </a>
  );
}

// The page frame: title and GHL's top-right buttons, then the body. No card
// around it; GHL pages lay their own cards and tables straight on the canvas.
export function GhlPage({ title, status, actions, children }: { title: string; status?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex max-w-[1180px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-[20px] font-semibold text-text">{title}</h2>
          {status}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

// GHL's underline tab bar under a page title.
export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: readonly { id: T; label: string }[]; active: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-5 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 pb-2.5 text-[13px] font-semibold transition-colors",
            active === t.id ? "border-brand text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// A GHL settings card: title bar, body, and its own save button bottom right.
export function Panel({ title, right, footer, children, className }: { title: string; right?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col rounded-lg border border-border bg-surface", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3.5">
        <h3 className="font-display text-[15px] font-semibold text-text">{title}</h3>
        {right}
      </div>
      <div className="flex-1 px-5 py-4">{children}</div>
      {footer ? <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
    </section>
  );
}

// A labelled input, label above, the way every GHL form lays them out. A field
// that disagrees with the onboarding form goes amber and offers its value.
export function Field({
  label,
  value,
  onChange,
  form,
  placeholder,
  type = "text",
  options,
  className,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  form?: string;
  placeholder?: string;
  type?: string;
  options?: string[];
  className?: string;
}) {
  const differs = form !== undefined && form.trim() !== value.trim();
  const box = cn(SOP_FIELD, "py-1.5", differs && "border-warning");
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-muted">
        {label}
        {differs && (
          <button type="button" onClick={() => onChange?.(form!)} className="truncate text-[11.5px] font-semibold text-warning hover:underline" title={form}>
            Form: {form || "blank"}
          </button>
        )}
      </span>
      {options ? (
        <select className={box} value={value} onChange={(e) => onChange?.(e.target.value)}>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input className={box} type={type} value={value} placeholder={placeholder} readOnly={!onChange} onChange={(e) => onChange?.(e.target.value)} />
      )}
    </label>
  );
}

// GHL's right-hand slide-over (Add Employee, Edit Custom Value, ...).
export function Drawer({ open, title, onClose, footer, children, wide }: { open: boolean; title: string; onClose: () => void; footer?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className={cn("relative flex h-full w-full flex-col border-l border-border bg-surface shadow-lg", wide ? "max-w-[760px]" : "max-w-[480px]")}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-display text-[16px] font-semibold text-text">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-faint hover:text-text">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
      </aside>
    </div>
  );
}

// A save button that says "Saved" for a moment after a real save lands.
export function SaveButton({ label = "Save", busy, disabled, onClick }: { label?: string; busy?: boolean; disabled?: boolean; onClick: () => void }) {
  const [done, setDone] = useState(false);
  const [was, setWas] = useState(false);
  useEffect(() => {
    if (was && !busy) setDone(true);
    setWas(!!busy);
  }, [busy, was]);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <SopButton primary disabled={disabled || busy} onClick={onClick}>
      {done ? <Check size={13} aria-hidden /> : null}
      {busy ? "Saving..." : done ? "Saved" : label}
    </SopButton>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-brand" : "bg-surface-3")}
    >
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left]", on ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-tint text-[11.5px] font-bold text-brand-text">
      {name
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "?"}
    </span>
  );
}

export function IconBtn({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-[var(--radius)] text-faint transition-colors hover:bg-surface-2 hover:text-text">
      {children}
    </button>
  );
}

export function Search({ value, onChange, placeholder = "Search" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className={cn(SOP_FIELD, "w-[220px] py-1.5")} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export const TH = "px-4 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-faint";
export const TD = "px-4 py-3 align-middle text-[13px] text-text";

export function Table({ head, children, toolbar }: { head: string[]; children: ReactNode; toolbar?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {toolbar ? <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">{toolbar}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-surface-2">
            <tr>
              {head.map((h, i) => (
                <th key={`${h}${i}`} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

/** Loading and failed states for a page's main read. */
export function PageState({ title, loading, error }: { title: string; loading: boolean; error: unknown }) {
  return (
    <GhlPage title={title}>
      <div className="rounded-lg border border-border bg-surface px-5 py-10 text-center text-[13px] text-muted">
        {loading ? "Loading..." : errText(error)}
      </div>
    </GhlPage>
  );
}

export function errText(error: unknown): string {
  if (!error) return "";
  return error instanceof Error ? error.message : String(error);
}

export function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="text-[12.5px] text-danger">{errText(error) || "That did not work."}</p>;
}

/** +18152784229 as (815) 278-4229, the way the snapshot's values are written. */
export function fmtPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

export const samePhone = (a: string, b: string) => !!a && !!b && a.replace(/\D/g, "").slice(-10) === b.replace(/\D/g, "").slice(-10);
