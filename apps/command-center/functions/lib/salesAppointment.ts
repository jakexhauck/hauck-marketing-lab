import type { ContactAppointment } from "./estimateOutcome";

// Which appointment the Sales board's panel shows for a contact (Jake,
// 2026-10-13: "appointment date and start time"). The next one still on the
// books; failing that, the latest one, so a no-show still shows when it was.
// Cancelled and deleted appointments never count.
export function pickSalesAppointment(appts: ContactAppointment[], now: number): string | null {
  const live = appts
    .filter((a) => !a.deleted && !/cancel/.test(a.status))
    .map((a) => Date.parse(a.startTime))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (!live.length) return null;
  const next = live.find((t) => t >= now);
  return new Date(next ?? live[live.length - 1]).toISOString();
}
