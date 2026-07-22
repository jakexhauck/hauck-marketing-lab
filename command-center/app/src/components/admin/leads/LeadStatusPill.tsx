import { useCallback, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AdminLeadStatus } from "../../../lib/api";
import { STATUS_META } from "../../../lib/adminLeads";
import LeadStatusMenu from "./LeadStatusMenu";

// The colour-coded status cell: a tinted pill with a dot and a caret that opens
// the seven-status picker. Ported from the .pill block in leads-B.html.
// Choosing a different status calls onChange straight away; picking the current
// one just closes the menu, so no needless write goes out.

interface LeadStatusPillProps {
  status: AdminLeadStatus;
  onChange: (status: AdminLeadStatus) => void;
  label?: string;
}

export default function LeadStatusPill({ status, onChange, label }: LeadStatusPillProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const meta = STATUS_META[status];

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`adl-pill ${meta.pillClass}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label ? `${label}: ${meta.label}` : `Status: ${meta.label}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="adl-pdot" aria-hidden />
        {meta.label}
        <ChevronDown size={12} strokeWidth={2.4} aria-hidden />
      </button>

      {open && (
        <LeadStatusMenu
          anchorRef={buttonRef}
          current={status}
          onClose={close}
          onSelect={(next) => {
            setOpen(false);
            if (next !== status) onChange(next);
          }}
        />
      )}
    </>
  );
}
