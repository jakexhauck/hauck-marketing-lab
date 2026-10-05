import { useState, type CSSProperties, type FocusEvent, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { switchTarget, type ParsedClientPath } from "../../lib/clientNav";
import type { AdminClient } from "../../lib/api";

// The client strip: a thin column of chips left of the admin sidebar (Jake,
// 2026-10-05, picked over a dropdown and a switcher card). The Agency chip on
// top, then one chip per client in their own brand colour, then + for a new
// client. A chip is a whole sub-account: clicking it swaps the sidebar.
//
// Desktop and owner only. The phone has no room for a second column, so it
// reaches the same choice through ClientSheet from the bottom bar.
//
// Names show as a tooltip on hover and nowhere else: the colour and initials
// are the label, the way a chat app's server column works.

export const STRIP_ORDER = (clients: AdminClient[]) =>
  [...clients].sort((a, b) => a.name.localeCompare(b.name));

export default function ClientStrip({
  clients,
  current,
  agencyHome,
}: {
  clients: AdminClient[];
  // Where we are now, or null in Agency view.
  current: ParsedClientPath | null;
  agencyHome: string;
}) {
  const navigate = useNavigate();
  const activeId = current?.tenantId ?? null;
  // The hover label is drawn once, outside the scrolling list, at the hovered
  // chip's height: inside the list it would be clipped by the list's own
  // overflow.
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const showTip = (label: string) => (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2 });
  };
  const hideTip = () => setTip(null);

  return (
    <div className="adm-strip hidden lg:flex" aria-label="Clients" role="navigation">
      <StripChip
        label="Agency"
        initials="H"
        onTip={showTip}
        onTipEnd={hideTip}
        on={activeId === null}
        onClick={() => navigate(agencyHome)}
      />
      <div className="adm-strip-rule" aria-hidden />
      <div className="adm-strip-list">
        {STRIP_ORDER(clients).map((c) => (
          <StripChip
            key={c.id}
            label={c.name}
            initials={c.brandInitials || c.name.slice(0, 2).toUpperCase()}
            color={c.brandColor}
            on={c.id === activeId}
            onTip={showTip}
            onTipEnd={hideTip}
            onClick={() => {
              if (c.id === activeId) return;
              navigate(switchTarget(current, c));
            }}
          />
        ))}
        <button
          type="button"
          className="adm-chip adm-chip-add"
          onClick={() => navigate("/admin/onboarding")}
          onMouseEnter={showTip("New client")}
          onMouseLeave={hideTip}
          onFocus={showTip("New client")}
          onBlur={hideTip}
          aria-label="New client"
        >
          <Plus size={16} aria-hidden />
        </button>
      </div>
      {tip && (
        <span className="adm-chip-tip" style={{ top: tip.top }} aria-hidden>
          {tip.label}
        </span>
      )}
      <StripStyle />
    </div>
  );
}

function StripChip({
  label,
  initials,
  color,
  on,
  onClick,
  onTip,
  onTipEnd,
}: {
  label: string;
  initials: string;
  // Absent for the Agency chip, which wears the console's own brand.
  color?: string;
  on: boolean;
  onClick: () => void;
  onTip: (label: string) => (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => void;
  onTipEnd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onTip(label)}
      onMouseLeave={onTipEnd}
      onFocus={onTip(label)}
      onBlur={onTipEnd}
      aria-label={label}
      aria-current={on ? "page" : undefined}
      className={`adm-chip${on ? " on" : ""}`}
      style={color ? ({ "--brand": color } as CSSProperties) : undefined}
    >
      {initials}
    </button>
  );
}

// Scoped to .pk-kit like the rest of the admin chrome. A chip re-derives the
// brand gradient from its own --brand, so each one wears its client's colour
// with the same recipe the console uses for its own.
function StripStyle() {
  return (
    <style>{`
      .pk-kit .adm-strip {
        height: 100%; width: 64px; flex-shrink: 0;
        flex-direction: column; align-items: center; gap: 10px;
        padding: 16px 0;
        background: var(--surface);
        border-right: 1px solid rgba(120,115,160,0.16);
        z-index: 31;
      }
      [data-theme="dark"] .pk-kit .adm-strip { border-right-color: rgba(255,255,255,0.07); }
      .pk-kit .adm-strip-rule { width: 28px; border-top: 1px solid var(--border); flex-shrink: 0; }
      .pk-kit .adm-strip-list {
        flex: 1 1 auto; min-height: 0; width: 100%;
        display: flex; flex-direction: column; align-items: center; gap: 10px;
        overflow-y: auto; overflow-x: visible; scrollbar-width: none;
      }
      .pk-kit .adm-strip-list::-webkit-scrollbar { display: none; }
      .pk-kit .adm-chip {
        position: relative; flex-shrink: 0;
        width: 40px; height: 40px; border-radius: 12px;
        display: grid; place-items: center;
        color: #fff; font-family: var(--font-display); font-weight: 700; font-size: 13px;
        background-image: linear-gradient(135deg, var(--brand) 0%, color-mix(in srgb, var(--brand) 72%, white) 100%);
        transition: border-radius .18s ease, transform .18s ease, box-shadow .18s ease;
      }
      .pk-kit .adm-chip:hover { border-radius: 14px; transform: translateY(-1px); }
      .pk-kit .adm-chip:active { transform: scale(0.96); }
      .pk-kit .adm-chip.on { box-shadow: 0 8px 22px color-mix(in srgb, var(--brand) 28%, transparent); }
      .pk-kit .adm-chip.on::before {
        content: ""; position: absolute; left: -12px; top: 8px; bottom: 8px; width: 4px;
        border-radius: 0 4px 4px 0; background: var(--text);
      }
      .pk-kit .adm-chip-add {
        background: none; color: var(--text-faint);
        border: 1.5px dashed var(--border-strong, var(--border));
      }
      .pk-kit .adm-chip-add:hover { color: var(--text); }
      .pk-kit .adm-chip-tip {
        position: fixed; left: 70px; transform: translateY(-50%);
        background: #14161f; color: #fff;
        font-family: var(--font-body); font-weight: 500; font-size: 12px;
        padding: 5px 9px; border-radius: 7px; white-space: nowrap;
        pointer-events: none; z-index: 60;
      }
      @media (prefers-reduced-motion: reduce) {
        .pk-kit .adm-chip { transition: none; }
      }
    `}</style>
  );
}
