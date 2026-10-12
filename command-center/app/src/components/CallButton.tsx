import { useState } from "react";
import { Phone } from "lucide-react";
import { callContact } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { cn } from "../lib/cn";

// The two-way Call button (Jake, 2026-10-12). Tapping it rings the owner's
// phone; when they answer, GHL dials the lead and bridges them on the business
// number, recorded and logged on the contact. Same Call Now workflow the texted
// owner link fires, so there is nothing new to set up per client.
//
// Only a real GHL contact can be called this way. Meta form leads with no GHL
// record ("meta:<id>") fall back to a plain tel: link.

const GHL_CONTACT = /^[A-Za-z0-9]{8,64}$/;

export function canBridgeCall(contactId: string | null | undefined): contactId is string {
  return Boolean(contactId && GHL_CONTACT.test(contactId));
}

export function useBridgeCall() {
  const { showToast } = useToast();
  const [calling, setCalling] = useState(false);
  const call = async (contactId: string) => {
    if (calling) return;
    setCalling(true);
    try {
      await callContact(contactId);
      showToast("Ringing your phone");
    } catch {
      showToast("Could not start the call. Try again.");
    } finally {
      setCalling(false);
    }
  };
  return { call, calling };
}

type Variant = "solid" | "outline" | "icon";

const STYLES: Record<Variant, string> = {
  solid:
    "h-[52px] w-full gap-2 rounded-[14px] bg-emerald-600 text-[15.5px] font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600",
  outline:
    "h-9 gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] font-semibold text-emerald-700 hover:bg-[var(--surface-2)] dark:text-emerald-400",
  icon: "h-9 w-9 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500",
};

export default function CallButton({
  contactId,
  phone,
  label = "Call",
  variant = "outline",
  className,
  onCalled,
}: {
  contactId: string | null | undefined;
  phone?: string | null;
  label?: string;
  variant?: Variant;
  className?: string;
  onCalled?: () => void;
}) {
  const { call, calling } = useBridgeCall();
  const base = cn(
    "inline-flex shrink-0 items-center justify-center transition-colors active:scale-[0.98] disabled:opacity-60",
    STYLES[variant],
    className,
  );
  const content = (
    <>
      <Phone size={variant === "solid" ? 18 : 15} strokeWidth={2.3} aria-hidden />
      {variant !== "icon" && <span>{label}</span>}
    </>
  );

  if (!canBridgeCall(contactId)) {
    if (!phone) return null;
    return (
      <a href={`tel:${phone}`} className={base} aria-label={label} onClick={(e) => { e.stopPropagation(); onCalled?.(); }}>
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      disabled={calling}
      className={base}
      onClick={(e) => {
        e.stopPropagation();
        void call(contactId);
        onCalled?.();
      }}
    >
      {content}
    </button>
  );
}
