// One vocabulary for every status across the app (leads, invoices, payments,
// appointments). Maps a raw backend string to a visual tone + clean label so a
// "paid" invoice, a "won" lead, and a "showed" appointment all read as the same
// kind of positive without each surface inventing its own colors.

export type Tone = "neutral" | "brand" | "positive" | "warning" | "danger";

export interface StatusMeta {
  tone: Tone;
  label: string;
}

const titleCase = (s: string) =>
  s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const LEAD: Record<string, StatusMeta> = {
  open: { tone: "brand", label: "Open" },
  won: { tone: "positive", label: "Won" },
  lost: { tone: "danger", label: "Lost" },
  abandoned: { tone: "neutral", label: "Abandoned" },
};

const INVOICE: Record<string, StatusMeta> = {
  paid: { tone: "positive", label: "Paid" },
  sent: { tone: "brand", label: "Sent" },
  overdue: { tone: "danger", label: "Overdue" },
  partially_paid: { tone: "warning", label: "Partial" },
  draft: { tone: "neutral", label: "Draft" },
  void: { tone: "neutral", label: "Void" },
};

const PAYMENT: Record<string, StatusMeta> = {
  succeeded: { tone: "positive", label: "Succeeded" },
  paid: { tone: "positive", label: "Paid" },
  pending: { tone: "warning", label: "Pending" },
  failed: { tone: "danger", label: "Failed" },
  refunded: { tone: "neutral", label: "Refunded" },
};

const APPOINTMENT: Record<string, StatusMeta> = {
  booked: { tone: "brand", label: "Booked" },
  confirmed: { tone: "positive", label: "Confirmed" },
  showed: { tone: "positive", label: "Showed" },
  cancelled: { tone: "danger", label: "Cancelled" },
  noshow: { tone: "danger", label: "No-show" },
  "no-show": { tone: "danger", label: "No-show" },
  invalid: { tone: "neutral", label: "Invalid" },
};

function lookup(map: Record<string, StatusMeta>, raw: string | null | undefined): StatusMeta {
  const key = (raw ?? "").toLowerCase().trim();
  return map[key] ?? { tone: "neutral", label: raw ? titleCase(raw) : "—" };
}

export const leadStatus = (s: string | null | undefined) => lookup(LEAD, s);
export const invoiceStatus = (s: string | null | undefined) => lookup(INVOICE, s);
export const paymentStatus = (s: string | null | undefined) => lookup(PAYMENT, s);
export const appointmentStatus = (s: string | null | undefined) => lookup(APPOINTMENT, s);

// Tailwind classes for a tone, used by Badge/StatusPill.
export const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted",
  brand: "bg-brand-tint text-brand-text",
  positive: "bg-positive-tint text-positive",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger",
};

export const toneDot: Record<Tone, string> = {
  neutral: "bg-faint",
  brand: "bg-brand",
  positive: "bg-positive",
  warning: "bg-warning",
  danger: "bg-danger",
};
