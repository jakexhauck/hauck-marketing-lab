// Job field rules, shared by every surface that writes a customer_jobs row: the
// close-out (via planCloseOut), the hand-added job, and the edit.
//
// One copy so the close-out and the edit cannot disagree about what a valid job
// is — a value the close-out rejects must not become saveable by editing it in
// afterwards.

export type JobFieldError = "description_required" | "negative_value" | "future_date" | "invalid_date";

export interface JobFields {
  description: string;
  valueCents: number;
  completedOn: string; // YYYY-MM-DD
}

// A bare YYYY-MM-DD compared as a string against today's YYYY-MM-DD. Parsing to
// Date and comparing instants would drag the job date through a timezone and
// reject work completed today for anyone west of UTC.
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function validateJobFields(fields: JobFields, today: Date): JobFieldError | null {
  if (!fields.description.trim()) return "description_required";
  // $0 is deliberately allowed: a warranty callback is real work worth recording.
  if (!Number.isFinite(fields.valueCents) || fields.valueCents < 0) return "negative_value";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.completedOn)) return "invalid_date";
  if (Number.isNaN(new Date(`${fields.completedOn}T00:00:00.000Z`).getTime())) {
    return "invalid_date";
  }
  if (fields.completedOn > isoDay(today)) return "future_date";
  return null;
}
