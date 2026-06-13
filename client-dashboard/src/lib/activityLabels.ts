// Display names for webhook activity kinds, shared by the Home feed and the
// notification center. An unknown kind renders humanized (underscores out,
// first letter up) instead of raw snake_case, so a new backend event never
// shows as "appointment_create" while the frontend catches up.
const ACTIVITY_LABELS: Record<string, string> = {
  lead_created: "New lead",
  stage_changed: "Stage changed",
  status_changed: "Lead status changed",
  message_in: "Inbound message",
  message_out: "Outbound message",
  appointment_create: "Appointment booked",
  appointment_update: "Appointment updated",
  appointment_delete: "Appointment cancelled",
  invoice_create: "Invoice created",
  invoice_sent: "Invoice sent",
  invoice_paid: "Invoice paid",
};

export function activityLabel(kind: string): string {
  const known = ACTIVITY_LABELS[kind];
  if (known) return known;
  const humanized = kind.replace(/_/g, " ").trim();
  return humanized
    ? humanized.charAt(0).toUpperCase() + humanized.slice(1)
    : kind;
}
