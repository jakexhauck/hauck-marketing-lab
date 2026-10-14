import { Phone, MessageSquare, Mail, CheckCircle2, ArrowRightLeft } from "lucide-react";
import { e164 } from "../../lib/phone";

interface Props {
  phone: string;
  email: string;
  canWon: boolean;
  canMove: boolean;
  wonLabel: string;
  onText: () => void;
  onEmail: () => void;
  onWon: () => void;
  onMove: () => void;
}

const CELL =
  "flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface px-2 py-3 text-[12px] font-semibold text-text shadow-[var(--shadow-sm)] transition-transform active:scale-[0.97] disabled:opacity-40";

export default function LeadActionRail({
  phone,
  email,
  canWon,
  canMove,
  wonLabel,
  onText,
  onEmail,
  onWon,
  onMove,
}: Props) {
  const tel = e164(phone);
  const hasPhone = tel.replace(/[^0-9]/g, "").length >= 10;
  return (
    <div className="grid grid-cols-5 gap-2">
      <a
        href={hasPhone ? `tel:${tel}` : undefined}
        aria-disabled={!hasPhone}
        className={CELL + (hasPhone ? "" : " pointer-events-none opacity-40")}
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-tint text-brand-text">
          <Phone size={18} />
        </span>
        Call
      </a>
      <button type="button" onClick={onText} disabled={!hasPhone} className={CELL}>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,#0284c7_12%,transparent)] text-[#0284c7]">
          <MessageSquare size={18} />
        </span>
        Text
      </button>
      <a
        href={email ? `mailto:${email}` : undefined}
        onClick={onEmail}
        aria-disabled={!email}
        className={CELL + (email ? "" : " pointer-events-none opacity-40")}
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,#0d9488_12%,transparent)] text-[#0d9488]">
          <Mail size={18} />
        </span>
        Email
      </a>
      <button type="button" onClick={onWon} disabled={!canWon} className={CELL}>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-positive-tint text-positive">
          <CheckCircle2 size={18} />
        </span>
        {wonLabel}
      </button>
      <button type="button" onClick={onMove} disabled={!canMove} className={CELL}>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-warning-tint text-warning">
          <ArrowRightLeft size={18} />
        </span>
        Move
      </button>
    </div>
  );
}
