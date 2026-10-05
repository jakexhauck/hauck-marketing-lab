import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { STRIP_ORDER } from "./ClientStrip";
import { clientRowIcon } from "./clientRowIcons";
import { clientNavGroups, clientPath, type ParsedClientPath } from "../../lib/clientNav";
import type { AdminClient } from "../../lib/api";

// The phone's client strip: a bottom sheet from the bottom bar's Clients tab.
// Two levels in one sheet. The first is the strip as a list (Agency, every
// client, New client); picking a client shows that client's pages, grouped as
// the desktop sidebar groups them. Opened from inside a client, it starts on
// that client's pages, since that is usually where the next tap is.

export default function ClientSheet({
  clients,
  current,
  agencyHome,
  onClose,
}: {
  clients: AdminClient[];
  current: ParsedClientPath | null;
  agencyHome: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(current?.tenantId ?? null);
  const open = clients.find((c) => c.id === openId) ?? null;

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={open ? open.name : "Clients"}
        className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {open && (
            <button
              type="button"
              onClick={() => setOpenId(null)}
              aria-label="All clients"
              className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] active:scale-[0.96]"
            >
              <ChevronLeft size={18} aria-hidden />
            </button>
          )}
          <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-[var(--text)]">
            {open ? open.name : "Clients"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] active:scale-[0.96]"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {open ? (
          <div className="mt-3 flex flex-col gap-0.5">
            {clientNavGroups(open).map((g, i) => (
              <Fragment key={i}>
                {g.caption && <span className="label-cap px-3 pb-1 pt-3">{g.caption}</span>}
                {g.rule && <div className="mx-3 my-2 border-t border-[var(--border)]" />}
                {g.rows.map((row) => {
                  const Icon = clientRowIcon(row);
                  const on =
                    current?.tenantId === open.id && current.page === row.page && current.sub === row.sub;
                  return (
                    <button
                      key={`${row.page}/${row.sub ?? ""}`}
                      type="button"
                      onClick={() => go(clientPath(open.id, row.page, row.sub))}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-[var(--text)] active:bg-[var(--surface-2)]"
                    >
                      <Icon size={17} aria-hidden className="opacity-80" />
                      <span className="flex-1">{row.label}</span>
                      {on && <Check size={16} aria-hidden className="text-[var(--brand-text)]" />}
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-0.5">
            <SheetRow
              initials="H"
              label="Agency"
              on={current === null}
              onClick={() => go(agencyHome)}
            />
            <div className="mx-3 my-2 border-t border-[var(--border)]" />
            {STRIP_ORDER(clients).map((c) => (
              <SheetRow
                key={c.id}
                initials={c.brandInitials || c.name.slice(0, 2).toUpperCase()}
                color={c.brandColor}
                label={c.name}
                on={current?.tenantId === c.id}
                drill
                onClick={() => setOpenId(c.id)}
              />
            ))}
            <button
              type="button"
              onClick={() => go("/admin/onboarding")}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--text-muted)] active:bg-[var(--surface-2)]"
            >
              <span className="grid h-8 w-8 place-items-center rounded-[10px] border-[1.5px] border-dashed border-[var(--border)]">
                <Plus size={15} aria-hidden />
              </span>
              New client
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SheetRow({
  initials,
  color,
  label,
  on,
  drill,
  onClick,
}: {
  initials: string;
  color?: string;
  label: string;
  on: boolean;
  drill?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--text)] active:bg-[var(--surface-2)]"
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] font-display text-[12px] font-bold text-white"
        style={{ background: color ?? "var(--grad-brand)" }}
        aria-hidden
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {on && <Check size={16} aria-hidden className="text-[var(--brand-text)]" />}
      {drill && <ChevronRight size={16} aria-hidden className="text-[var(--text-faint)]" />}
    </button>
  );
}
