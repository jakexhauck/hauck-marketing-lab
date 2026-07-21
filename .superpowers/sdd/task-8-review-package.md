# Review package: Task 8 (1b1b49b..8024781)

## Commits
8024781 feat(setter): lead cockpit with dial logging, tags, and booking

## Stat
 .../app/src/components/admin/setter/DialLogger.tsx | 159 ++++++++++++++
 .../src/components/admin/setter/SetterCockpit.tsx  | 174 +++++++++++++++
 .../app/src/components/admin/setter/SlotPicker.tsx | 225 +++++++++++++++++++
 .../app/src/components/admin/setter/TagField.tsx   | 153 +++++++++++++
 command-center/app/src/hooks/useApi.ts             | 207 ++++++++++++++++++
 command-center/app/src/lib/api.ts                  |  31 +++
 command-center/app/src/lib/setterCockpit.test.ts   | 239 +++++++++++++++++++++
 command-center/app/src/lib/setterCockpit.ts        | 147 +++++++++++++
 .../app/src/routes/admin/SetterSuite.tsx           |  41 ++--
 9 files changed, 1362 insertions(+), 14 deletions(-)

## Diff
```diff
diff --git a/command-center/app/src/components/admin/setter/DialLogger.tsx b/command-center/app/src/components/admin/setter/DialLogger.tsx
new file mode 100644
index 0000000..ef47fa7
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/DialLogger.tsx
@@ -0,0 +1,159 @@
+import { useState } from "react";
+import { Loader2, Phone, PhoneOff } from "lucide-react";
+import { useLogSetterDial } from "../../../hooks/useApi";
+import { useToast } from "../../../context/ToastContext";
+import {
+  OUTCOMES,
+  defaultSpokeForOutcome,
+  isContradictoryDial,
+  type SetterOutcome,
+} from "../../../lib/setterCockpit";
+import type { ApiSetterLead } from "../../../lib/api";
+
+interface Props {
+  tenantId: string;
+  pipelineId: string;
+  pipelineName: string;
+  lead: ApiSetterLead;
+}
+
+// Log this call: the five outcome buttons, a spoke override, and an
+// optional note, submitted together as one setter_dials row. Picking an
+// outcome sets spoke to the server's own default (functions/api/admin/setter
+// /dials.ts:validateDialBody rejects no_answer + spoke:true as
+// "contradictory") so the common path never needs the override touched; the
+// toggle stays visible for the setter to correct a default that does not
+// match what actually happened on the call.
+export default function DialLogger({ tenantId, pipelineId, pipelineName, lead }: Props) {
+  const { showToast } = useToast();
+  const logDial = useLogSetterDial();
+
+  const [outcome, setOutcome] = useState<SetterOutcome | null>(null);
+  const [spoke, setSpoke] = useState(true);
+  const [note, setNote] = useState("");
+
+  const pickOutcome = (value: SetterOutcome) => {
+    setOutcome(value);
+    setSpoke(defaultSpokeForOutcome(value));
+  };
+
+  const contradictory = outcome !== null && isContradictoryDial(outcome, spoke);
+  const canSubmit = outcome !== null && !contradictory && !logDial.isPending;
+
+  const submit = () => {
+    if (!outcome || contradictory) return;
+    const outcomeDef = OUTCOMES.find((o) => o.value === outcome);
+    logDial.mutate(
+      {
+        tenantId,
+        pipelineId,
+        leadId: lead.id,
+        contactId: lead.contactId,
+        opportunityId: lead.id,
+        pipelineName,
+        stageName: lead.stageName,
+        spoke,
+        outcome,
+        note: note.trim() ? note.trim() : null,
+      },
+      {
+        onSuccess: () => {
+          showToast(`Logged: ${outcomeDef?.label ?? outcome}`);
+          setOutcome(null);
+          setSpoke(true);
+          setNote("");
+        },
+        onError: (err) => {
+          const body =
+            err && typeof err === "object" && "body" in err
+              ? (err as { body?: { error?: string } }).body
+              : null;
+          if (body?.error === "contradictory") {
+            showToast(
+              "No answer cannot be logged as spoke with. Turn off the spoke override or pick a different outcome.",
+            );
+          } else {
+            showToast("Could not log that call, please try again");
+          }
+        },
+      },
+    );
+  };
+
+  return (
+    <div className="flex flex-col gap-3">
+      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
+        {OUTCOMES.map((o) => {
+          const on = outcome === o.value;
+          return (
+            <button
+              key={o.value}
+              type="button"
+              onClick={() => pickOutcome(o.value)}
+              className={
+                "rounded-[var(--radius)] border px-3 py-2.5 text-left font-display text-[13px] font-semibold transition-colors " +
+                (on
+                  ? "border-brand bg-brand-tint text-brand-text"
+                  : "border-border bg-surface text-text hover:border-brand/40")
+              }
+            >
+              {o.label}
+            </button>
+          );
+        })}
+      </div>
+
+      <label className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5">
+        <span className="flex items-center gap-2 text-[13px] font-medium text-text">
+          {spoke ? (
+            <Phone size={14} className="text-positive" aria-hidden />
+          ) : (
+            <PhoneOff size={14} className="text-faint" aria-hidden />
+          )}
+          Spoke with them
+        </span>
+        <span
+          role="switch"
+          aria-checked={spoke}
+          onClick={() => setSpoke((s) => !s)}
+          className={
+            "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors " +
+            (spoke ? "bg-positive" : "bg-surface-3")
+          }
+        >
+          <span
+            className={
+              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[var(--shadow-sm)] transition-all " +
+              (spoke ? "left-[18px]" : "left-0.5")
+            }
+          />
+        </span>
+      </label>
+
+      {contradictory && (
+        <p className="text-[12px] font-medium text-danger">
+          No answer cannot be paired with Spoke with them. Turn the toggle off or pick a
+          different outcome.
+        </p>
+      )}
+
+      <textarea
+        value={note}
+        onChange={(e) => setNote(e.target.value)}
+        placeholder="Note about this call (optional)"
+        className="min-h-[64px] w-full resize-y rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand/50"
+      />
+
+      <button
+        type="button"
+        onClick={submit}
+        disabled={!canSubmit}
+        className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-2.5 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
+        style={{ backgroundImage: "var(--grad-brand)" }}
+      >
+        {logDial.isPending && <Loader2 size={14} className="animate-spin" />}
+        {logDial.isPending ? "Logging..." : "Log dial"}
+      </button>
+    </div>
+  );
+}
diff --git a/command-center/app/src/components/admin/setter/SetterCockpit.tsx b/command-center/app/src/components/admin/setter/SetterCockpit.tsx
new file mode 100644
index 0000000..1550fbb
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/SetterCockpit.tsx
@@ -0,0 +1,174 @@
+import { Mail, Phone, X } from "lucide-react";
+import Avatar from "../../Avatar";
+import DialLogger from "./DialLogger";
+import TagField from "./TagField";
+import SlotPicker from "./SlotPicker";
+import { useSetterLeadDetailQuery } from "../../../hooks/useApi";
+import { useNow } from "../../../context/NowContext";
+import { e164, formatPhone } from "../../../lib/phone";
+import { timeAgo } from "../../../lib/timeAgo";
+import { formatOutcome } from "../../../lib/setterModel";
+import { isOptimisticDial } from "../../../lib/setterCockpit";
+import type { ApiSetterLead } from "../../../lib/api";
+
+interface Props {
+  tenantId: string;
+  pipelineId: string;
+  pipelineName: string;
+  lead: ApiSetterLead;
+  onClose: () => void;
+}
+
+function Section({ title, children }: { title: string; children: React.ReactNode }) {
+  return (
+    <section className="border-t border-divider px-4 py-4 first:border-t-0">
+      <h3 className="label-cap mb-2.5 text-faint">{title}</h3>
+      {children}
+    </section>
+  );
+}
+
+// The lead cockpit: one selected lead's live identity, the call-logging
+// form, tags, booking, and history, docked to the right of the board
+// (src/routes/admin/SetterSuite.tsx). Reads its own detail off
+// contactId (tags + full dial history are only on this per-lead endpoint,
+// never the board list, see functions/api/admin/setter/lead/[contactId].ts),
+// falling back to the board card's own fields while that request is in
+// flight or if it errors, so switching leads never shows a blank panel.
+export default function SetterCockpit({ tenantId, pipelineId, pipelineName, lead, onClose }: Props) {
+  const now = useNow();
+  const detailQuery = useSetterLeadDetailQuery(tenantId, lead.contactId, true);
+  const detail = detailQuery.data?.lead;
+
+  const name = detail?.name || lead.name;
+  const phone = detail?.phone || lead.phone;
+  const email = detail?.email || "";
+  const tags = detail?.tags ?? [];
+  const dials = detail?.dials ?? [];
+
+  const telDigits = e164(phone);
+  const hasPhone = telDigits.replace(/[^0-9]/g, "").length >= 10;
+
+  return (
+    <aside
+      className="flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] lg:w-[380px] lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)]"
+      aria-label="Lead cockpit"
+    >
+      {/* Header: identity + click-to-call, stays put while the body scrolls. */}
+      <div className="flex items-start gap-3 border-b border-divider px-4 pb-3.5 pt-4">
+        <Avatar name={name} size="sm" />
+        <div className="min-w-0 flex-1">
+          <div className="truncate font-display text-[15px] font-semibold text-text">{name}</div>
+          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
+            {hasPhone ? (
+              <a
+                href={`tel:${telDigits}`}
+                className="inline-flex items-center gap-1 font-data text-brand-text hover:underline"
+              >
+                <Phone size={11} aria-hidden />
+                {formatPhone(phone) || phone}
+              </a>
+            ) : (
+              <span className="text-faint">No phone on file</span>
+            )}
+            {email && (
+              <a
+                href={`mailto:${email}`}
+                className="inline-flex min-w-0 items-center gap-1 truncate text-brand-text hover:underline"
+              >
+                <Mail size={11} aria-hidden className="shrink-0" />
+                <span className="truncate">{email}</span>
+              </a>
+            )}
+          </div>
+          <div className="mt-1.5 truncate text-[11px] text-faint">{lead.stageName}</div>
+        </div>
+        <button
+          type="button"
+          onClick={onClose}
+          aria-label="Close lead cockpit"
+          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-text"
+        >
+          <X size={14} />
+        </button>
+      </div>
+
+      {/* Body: everything below scrolls on its own, the board above/behind
+          it keeps whatever scroll position it was at. */}
+      <div className="min-h-0 flex-1 overflow-y-auto">
+        <Section title="Log this call">
+          <DialLogger tenantId={tenantId} pipelineId={pipelineId} pipelineName={pipelineName} lead={lead} />
+        </Section>
+
+        <Section title="Tags">
+          <TagField tenantId={tenantId} contactId={lead.contactId} tags={tags} dials={dials} />
+        </Section>
+
+        <Section title="Book an estimate">
+          <SlotPicker tenantId={tenantId} contactId={lead.contactId} leadName={name} />
+        </Section>
+
+        <Section title="Call history">
+          {detailQuery.isLoading ? (
+            <p className="text-[12.5px] text-muted">Loading history...</p>
+          ) : dials.length === 0 ? (
+            <p className="text-[12.5px] text-faint">No dials logged yet.</p>
+          ) : (
+            <ul className="flex flex-col gap-2.5">
+              {dials.map((d) => (
+                <li
+                  key={d.id}
+                  className={
+                    "rounded-[var(--radius)] border px-3 py-2.5 " +
+                    (isOptimisticDial(d.id)
+                      ? "border-dashed border-brand/40 bg-brand-tint/40"
+                      : "border-border bg-surface-2")
+                  }
+                >
+                  <div className="flex items-center justify-between gap-2">
+                    <span className="font-display text-[12.5px] font-semibold text-text">
+                      {formatOutcome(d.outcome)}
+                    </span>
+                    <span className="font-data shrink-0 text-[11px] text-faint">
+                      {timeAgo(d.dialedAt, now)}
+                    </span>
+                  </div>
+                  <div className="mt-1 flex items-center gap-1.5">
+                    <span
+                      className={
+                        "rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide " +
+                        (d.spoke ? "bg-positive-tint text-positive" : "bg-surface-3 text-faint")
+                      }
+                    >
+                      {d.spoke ? "Spoke" : "No answer"}
+                    </span>
+                    {isOptimisticDial(d.id) && (
+                      <span className="text-[10px] font-medium text-faint">Saving...</span>
+                    )}
+                  </div>
+                  {d.note && (
+                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[12px] text-muted">
+                      {d.note}
+                    </p>
+                  )}
+                  {d.tagsApplied.length > 0 && (
+                    <div className="mt-1.5 flex flex-wrap gap-1">
+                      {d.tagsApplied.map((t) => (
+                        <span
+                          key={t}
+                          className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted"
+                        >
+                          {t}
+                        </span>
+                      ))}
+                    </div>
+                  )}
+                </li>
+              ))}
+            </ul>
+          )}
+        </Section>
+      </div>
+    </aside>
+  );
+}
diff --git a/command-center/app/src/components/admin/setter/SlotPicker.tsx b/command-center/app/src/components/admin/setter/SlotPicker.tsx
new file mode 100644
index 0000000..ccd158d
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/SlotPicker.tsx
@@ -0,0 +1,225 @@
+import { useEffect, useState } from "react";
+import { CalendarClock, Loader2, TriangleAlert } from "lucide-react";
+import { useSetterSlotsQuery, useSetterBookMutation } from "../../../hooks/useApi";
+import { useToast } from "../../../context/ToastContext";
+import { ApiError } from "../../../lib/api";
+import { formatSlotDay, formatSlotTime, computeSlotEnd } from "../../../lib/setterCockpit";
+
+interface Props {
+  tenantId: string;
+  contactId: string;
+  leadName: string;
+}
+
+const DAYS_AHEAD = 14;
+const fieldClass =
+  "w-full rounded-[var(--radius)] border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-brand/50";
+
+// Live slot lookup + booking, scoped to a calendar chosen by name (the
+// Setter Suite works every pipeline for a client, so there is no single
+// fixed calendar to hardcode the way the client-facing "Home Estimate"
+// visit flow does; see functions/api/admin/setter/slots.ts + book.ts, both
+// generic on calendarName). A day selector narrows the live slot grid to
+// one day at a time so the docked panel stays compact.
+//
+// Booking is terminal: functions/api/admin/setter/book.ts deliberately does
+// not retry (a retry can double-book a real customer), and this component
+// honours that by disabling the Book button the instant the mutation is
+// in flight, with no retry wired anywhere in the call chain.
+export default function SlotPicker({ tenantId, contactId, leadName }: Props) {
+  const { showToast } = useToast();
+  const [calendarName, setCalendarName] = useState("Home Estimate");
+  const [durationMinutes, setDurationMinutes] = useState(60);
+  const [selectedDate, setSelectedDate] = useState<string | null>(null);
+  const [picked, setPicked] = useState<string | null>(null);
+
+  const slotsQuery = useSetterSlotsQuery(tenantId, calendarName, DAYS_AHEAD, true);
+  const bookMutation = useSetterBookMutation();
+
+  const days = slotsQuery.data?.days ?? [];
+
+  // Keep the selected day valid as the live data changes (a fresh calendar
+  // name, or a day that has since emptied out): fall back to the first day
+  // with slots rather than showing an empty grid for a day the API no
+  // longer lists.
+  useEffect(() => {
+    if (days.length === 0) {
+      setSelectedDate(null);
+      return;
+    }
+    if (!selectedDate || !days.some((d) => d.date === selectedDate)) {
+      setSelectedDate(days[0].date);
+    }
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [days.map((d) => d.date).join(",")]);
+
+  const activeDay = days.find((d) => d.date === selectedDate) ?? null;
+
+  const err = slotsQuery.error;
+  const errorCode =
+    err instanceof ApiError && err.body && typeof err.body === "object"
+      ? (err.body as { error?: string }).error
+      : null;
+  const needsStaff = errorCode === "needs_staff";
+  const notFound = errorCode === "calendar_not_found";
+
+  const book = () => {
+    if (!picked || bookMutation.isPending) return;
+    const endTime = computeSlotEnd(picked, durationMinutes);
+    bookMutation.mutate(
+      {
+        tenantId,
+        calendarName,
+        contactId,
+        startTime: picked,
+        endTime,
+        title: `Estimate for ${leadName}`,
+      },
+      {
+        onSuccess: () => {
+          showToast(`Booked ${formatSlotDay(picked.slice(0, 10))} at ${formatSlotTime(picked)}`);
+          setPicked(null);
+        },
+        onError: (e) => {
+          const code =
+            e instanceof ApiError && e.body && typeof e.body === "object"
+              ? (e.body as { error?: string }).error
+              : null;
+          if (code === "needs_staff") {
+            showToast("This calendar has no team members assigned, so it cannot be booked.");
+          } else {
+            showToast("Could not book that time, please try again");
+          }
+        },
+      },
+    );
+  };
+
+  return (
+    <div className="flex flex-col gap-3">
+      <div className="grid grid-cols-2 gap-2">
+        <label className="text-[11px] font-semibold uppercase tracking-wide text-faint">
+          Calendar
+          <input
+            value={calendarName}
+            onChange={(e) => {
+              setCalendarName(e.target.value);
+              setPicked(null);
+            }}
+            className={`${fieldClass} mt-1 normal-case`}
+          />
+        </label>
+        <label className="text-[11px] font-semibold uppercase tracking-wide text-faint">
+          Duration (min)
+          <input
+            type="number"
+            min={15}
+            step={15}
+            value={durationMinutes}
+            onChange={(e) => setDurationMinutes(Math.max(15, Number(e.target.value) || 60))}
+            className={`${fieldClass} mt-1 normal-case`}
+          />
+        </label>
+      </div>
+
+      {slotsQuery.isLoading && (
+        <div className="flex items-center gap-2 py-4 text-[12.5px] text-muted">
+          <Loader2 size={14} className="animate-spin" /> Loading available times...
+        </div>
+      )}
+
+      {!slotsQuery.isLoading && needsStaff && (
+        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
+          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
+          <span>This calendar has no team members assigned, so it cannot return availability.</span>
+        </div>
+      )}
+
+      {!slotsQuery.isLoading && notFound && (
+        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
+          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
+          <span>Could not find a calendar named &quot;{calendarName}&quot;. Check the name and try again.</span>
+        </div>
+      )}
+
+      {!slotsQuery.isLoading && slotsQuery.isError && !needsStaff && !notFound && (
+        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
+          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
+          <span>Could not load available times. Try again.</span>
+        </div>
+      )}
+
+      {!slotsQuery.isLoading && !slotsQuery.isError && days.length === 0 && (
+        <p className="py-2 text-[12.5px] text-muted">
+          No open times on this calendar in the next {DAYS_AHEAD} days.
+        </p>
+      )}
+
+      {!slotsQuery.isLoading && !slotsQuery.isError && days.length > 0 && (
+        <>
+          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
+            {days.map((d) => {
+              const on = d.date === selectedDate;
+              return (
+                <button
+                  key={d.date}
+                  type="button"
+                  onClick={() => {
+                    setSelectedDate(d.date);
+                    setPicked(null);
+                  }}
+                  className={
+                    "shrink-0 rounded-[var(--radius)] border px-2.5 py-1.5 font-display text-[12px] font-semibold transition-colors " +
+                    (on
+                      ? "border-brand bg-brand text-white shadow-[var(--shadow-brand)]"
+                      : "border-border bg-surface text-text hover:border-brand/40")
+                  }
+                >
+                  {formatSlotDay(d.date)}
+                </button>
+              );
+            })}
+          </div>
+
+          {activeDay && (
+            <div className="flex flex-wrap gap-1.5">
+              {activeDay.slots.map((slot) => {
+                const on = picked === slot;
+                return (
+                  <button
+                    key={slot}
+                    type="button"
+                    onClick={() => setPicked(slot)}
+                    className={
+                      "rounded-[var(--radius)] border px-2.5 py-1.5 font-display text-[12px] font-semibold transition-colors " +
+                      (on
+                        ? "border-brand bg-brand text-white shadow-[var(--shadow-brand)]"
+                        : "border-border bg-surface text-text hover:border-brand/40")
+                    }
+                  >
+                    {formatSlotTime(slot)}
+                  </button>
+                );
+              })}
+            </div>
+          )}
+
+          <button
+            type="button"
+            onClick={book}
+            disabled={!picked || bookMutation.isPending}
+            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-2.5 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
+            style={{ backgroundImage: "var(--grad-brand)" }}
+          >
+            {bookMutation.isPending ? (
+              <Loader2 size={14} className="animate-spin" />
+            ) : (
+              <CalendarClock size={14} />
+            )}
+            {bookMutation.isPending ? "Booking..." : picked ? "Book this time" : "Pick a time to book"}
+          </button>
+        </>
+      )}
+    </div>
+  );
+}
diff --git a/command-center/app/src/components/admin/setter/TagField.tsx b/command-center/app/src/components/admin/setter/TagField.tsx
new file mode 100644
index 0000000..0b50adb
--- /dev/null
+++ b/command-center/app/src/components/admin/setter/TagField.tsx
@@ -0,0 +1,153 @@
+import { useState } from "react";
+import { X, Plus, TriangleAlert } from "lucide-react";
+import { useSetterTagsMutation } from "../../../hooks/useApi";
+import { useToast } from "../../../context/ToastContext";
+import type { ApiSetterDial } from "../../../lib/api";
+
+interface Props {
+  tenantId: string;
+  contactId: string;
+  tags: string[];
+  dials: ApiSetterDial[];
+}
+
+// Derives suggestions from tags this contact's own dial history has already
+// applied (setter_dials.tags_applied), minus whatever is already on the
+// contact. Real, live, contact-specific data rather than a fabricated
+// location-wide catalog the backend does not expose.
+function suggestionsFrom(dials: ApiSetterDial[], current: string[]): string[] {
+  const currentSet = new Set(current.map((t) => t.toLowerCase()));
+  const seen = new Set<string>();
+  const out: string[] = [];
+  for (const d of dials) {
+    for (const t of d.tagsApplied) {
+      const key = t.toLowerCase();
+      if (currentSet.has(key) || seen.has(key)) continue;
+      seen.add(key);
+      out.push(t);
+    }
+  }
+  return out.slice(0, 6);
+}
+
+// Current tags as removable chips, a free input to add a new one, and a
+// short row of tags previously applied on this contact's own call history.
+// Every add/remove goes straight to the live CRM contact and fires that
+// client's automations, so this never guesses at the result: the chip list
+// always reflects the mutation response, the CRM's actual tag list after
+// the write (functions/api/admin/setter/tags.ts re-reads rather than
+// echoes).
+export default function TagField({ tenantId, contactId, tags, dials }: Props) {
+  const { showToast } = useToast();
+  const tagsMutation = useSetterTagsMutation();
+  const [draft, setDraft] = useState("");
+  const [busyTag, setBusyTag] = useState<string | null>(null);
+
+  const suggestions = suggestionsFrom(dials, tags);
+
+  const addTag = (tag: string) => {
+    const value = tag.trim();
+    if (!value || tags.some((t) => t.toLowerCase() === value.toLowerCase())) return;
+    tagsMutation.mutate(
+      { tenantId, contactId, add: [value] },
+      {
+        onSuccess: () => setDraft(""),
+        onError: () => showToast("Could not add that tag, please try again"),
+      },
+    );
+  };
+
+  const removeTag = (tag: string) => {
+    setBusyTag(tag);
+    tagsMutation.mutate(
+      { tenantId, contactId, remove: [tag] },
+      {
+        onSuccess: () => setBusyTag(null),
+        onError: () => {
+          setBusyTag(null);
+          showToast("Could not remove that tag, please try again");
+        },
+      },
+    );
+  };
+
+  return (
+    <div className="flex flex-col gap-2.5">
+      <div className="flex flex-wrap gap-1.5">
+        {tags.length === 0 ? (
+          <p className="text-[12.5px] text-faint">No tags on this contact yet.</p>
+        ) : (
+          tags.map((tag) => (
+            <span
+              key={tag}
+              className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-1.5 text-[11.5px] font-semibold text-muted"
+            >
+              {tag}
+              <button
+                type="button"
+                onClick={() => removeTag(tag)}
+                disabled={tagsMutation.isPending}
+                aria-label={`Remove tag ${tag}`}
+                className="grid h-4 w-4 place-items-center rounded-full text-faint transition-colors hover:bg-surface-3 hover:text-danger disabled:opacity-50"
+              >
+                {busyTag === tag && tagsMutation.isPending ? (
+                  <span className="h-2 w-2 animate-pulse rounded-full bg-faint" aria-hidden />
+                ) : (
+                  <X size={11} />
+                )}
+              </button>
+            </span>
+          ))
+        )}
+      </div>
+
+      <form
+        onSubmit={(e) => {
+          e.preventDefault();
+          addTag(draft);
+        }}
+        className="flex items-center gap-2"
+      >
+        <input
+          value={draft}
+          onChange={(e) => setDraft(e.target.value)}
+          placeholder="Add a tag"
+          className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand/50"
+        />
+        <button
+          type="submit"
+          disabled={!draft.trim() || tagsMutation.isPending}
+          aria-label="Add tag"
+          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] border border-border bg-surface text-muted transition-colors hover:border-brand/40 hover:text-brand-text disabled:opacity-50"
+        >
+          <Plus size={14} />
+        </button>
+      </form>
+
+      {suggestions.length > 0 && (
+        <div className="flex flex-wrap items-center gap-1.5">
+          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
+            Used before
+          </span>
+          {suggestions.map((tag) => (
+            <button
+              key={tag}
+              type="button"
+              onClick={() => addTag(tag)}
+              disabled={tagsMutation.isPending}
+              className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text disabled:opacity-50"
+            >
+              + {tag}
+            </button>
+          ))}
+        </div>
+      )}
+
+      <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-warning">
+        <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
+        Adding or removing a tag fires this client&apos;s automations immediately, only tag
+        what you mean to trigger.
+      </p>
+    </div>
+  );
+}
diff --git a/command-center/app/src/hooks/useApi.ts b/command-center/app/src/hooks/useApi.ts
index 9db518c..9045fb1 100644
--- a/command-center/app/src/hooks/useApi.ts
+++ b/command-center/app/src/hooks/useApi.ts
@@ -39,22 +39,32 @@ import {
   type AdTrackerLevel,
   type AdTrackerRange,
   type AdTrackerResponse,
   type ApiReviewsResponse,
   type PillarConstraint,
   getSalesData,
   saveSalesDataDay,
   type SalesDataRow,
   type SalesDataPatch,
   type ApiSetterPipeline,
+  type ApiSetterLead,
   type ApiSetterLeadsResponse,
+  type ApiSetterLeadDetail,
+  type ApiSetterDial,
 } from "../lib/api";
+import {
+  buildOptimisticDial,
+  prependOptimisticDial,
+  bumpLeadForDial,
+  OPTIMISTIC_DIAL_PREFIX,
+  type OptimisticDialInput,
+} from "../lib/setterCockpit";
 import type { BusinessHealthInputs, PeriodType } from "../lib/businessHealth";
 import {
   type CustomersResponse,
   type CustomerDetailResponse,
   type CustomerJobInput,
   type ServicePlanInput,
 } from "../lib/customers";
 import {
   type CloseOutPrefill,
   type CloseOutRequest,
@@ -428,20 +438,217 @@ export function useSetterLeadsQuery(tenantId: string, pipelineId: string, enable
     queryKey: ["admin", "setter", "leads", tenantId, pipelineId],
     enabled: enabled && !!tenantId && !!pipelineId,
     staleTime: 15_000,
     queryFn: () =>
       api<ApiSetterLeadsResponse>(
         `/api/admin/setter/leads?tenantId=${encodeURIComponent(tenantId)}&pipelineId=${encodeURIComponent(pipelineId)}`,
       ),
   });
 }
 
+// Setter Suite cockpit: one contact's live name/phone/email/tags plus its
+// full dial history, newest first. Powers the panel docked beside the
+// board (src/components/admin/setter/SetterCockpit.tsx).
+export function useSetterLeadDetailQuery(
+  tenantId: string,
+  contactId: string | null,
+  enabled = true,
+) {
+  return useQuery({
+    queryKey: ["admin", "setter", "lead", tenantId, contactId],
+    enabled: enabled && !!tenantId && !!contactId,
+    staleTime: 10_000,
+    queryFn: () =>
+      api<{ lead: ApiSetterLeadDetail }>(
+        `/api/admin/setter/lead/${encodeURIComponent(contactId ?? "")}?tenantId=${encodeURIComponent(tenantId)}`,
+      ),
+  });
+}
+
+export interface LogSetterDialInput extends OptimisticDialInput {
+  tenantId: string;
+  // Client-side only, never sent to the API: locates the board's cached
+  // leads list (["admin","setter","leads",tenantId,pipelineId]) so the
+  // matching card can be bumped optimistically. leadId is the opportunity
+  // id, ApiSetterLead.id, used to find the right card in that list.
+  pipelineId: string;
+  leadId: string;
+}
+
+// Logs one dial (POST /api/admin/setter/dials). Optimistic on both caches it
+// feeds: the lead detail's timeline (a dial appears immediately, newest
+// first, src/lib/setterCockpit.ts:prependOptimisticDial) and the board's
+// card (attempts/contacted/lastOutcome bump the same way the server's own
+// functions/lib/setterMetrics.ts:rollUpByContact would once the real row
+// lands, via bumpLeadForDial). Rolled back to the exact previous snapshot on
+// failure, never a partial patch, so a failed write can never leave a
+// phantom dial or an inflated attempt count on screen: the attempt count is
+// the setter's real contact-rate metric.
+export function useLogSetterDial() {
+  const qc = useQueryClient();
+  return useMutation({
+    mutationFn: (input: LogSetterDialInput) =>
+      api<{ dial: ApiSetterDial }>("/api/admin/setter/dials", {
+        method: "POST",
+        body: JSON.stringify({
+          tenantId: input.tenantId,
+          contactId: input.contactId,
+          opportunityId: input.opportunityId ?? null,
+          pipelineName: input.pipelineName ?? null,
+          stageName: input.stageName ?? null,
+          spoke: input.spoke,
+          outcome: input.outcome,
+          note: input.note ?? null,
+          tagsApplied: input.tagsApplied ?? [],
+        }),
+      }),
+    onMutate: async (input) => {
+      const detailKey = ["admin", "setter", "lead", input.tenantId, input.contactId] as const;
+      const listKey = ["admin", "setter", "leads", input.tenantId, input.pipelineId] as const;
+      await Promise.all([
+        qc.cancelQueries({ queryKey: detailKey }),
+        qc.cancelQueries({ queryKey: listKey }),
+      ]);
+
+      const previousDetail = qc.getQueryData<{ lead: ApiSetterLeadDetail }>(detailKey);
+      const previousList = qc.getQueryData<ApiSetterLeadsResponse>(listKey);
+
+      const tempId = `${OPTIMISTIC_DIAL_PREFIX}${Date.now()}`;
+      const nowIso = new Date().toISOString();
+      const optimisticDial = buildOptimisticDial(input, nowIso, tempId);
+
+      if (previousDetail) {
+        qc.setQueryData(detailKey, {
+          lead: {
+            ...previousDetail.lead,
+            dials: prependOptimisticDial(previousDetail.lead.dials, optimisticDial),
+          },
+        });
+      }
+      if (previousList) {
+        qc.setQueryData(listKey, {
+          ...previousList,
+          leads: previousList.leads.map((l: ApiSetterLead) =>
+            l.id === input.leadId ? bumpLeadForDial(l, optimisticDial) : l,
+          ),
+        });
+      }
+
+      return { previousDetail, previousList, detailKey, listKey };
+    },
+    onError: (_err, _input, context) => {
+      if (context?.previousDetail) qc.setQueryData(context.detailKey, context.previousDetail);
+      if (context?.previousList) qc.setQueryData(context.listKey, context.previousList);
+    },
+    onSettled: (_data, _err, input) => {
+      qc.invalidateQueries({ queryKey: ["admin", "setter", "lead", input.tenantId, input.contactId] });
+      qc.invalidateQueries({ queryKey: ["admin", "setter", "leads", input.tenantId, input.pipelineId] });
+    },
+  });
+}
+
+export interface SetterTagsInput {
+  tenantId: string;
+  contactId: string;
+  add?: string[];
+  remove?: string[];
+}
+
+// Adds/removes tags on the live CRM contact (POST /api/admin/setter/tags),
+// then writes the RESPONSE's tag list into the lead detail cache: the API
+// re-reads the contact after writing rather than echoing the request
+// (functions/api/admin/setter/tags.ts), and this does the same on the
+// client, so the cockpit only ever shows what the CRM actually holds, never
+// an optimistic guess, since these tags fire live automations.
+export function useSetterTagsMutation() {
+  const qc = useQueryClient();
+  return useMutation({
+    mutationFn: (input: SetterTagsInput) =>
+      api<{ tags: string[] }>("/api/admin/setter/tags", {
+        method: "POST",
+        body: JSON.stringify(input),
+      }),
+    onSuccess: (data, input) => {
+      const detailKey = ["admin", "setter", "lead", input.tenantId, input.contactId];
+      const previous = qc.getQueryData<{ lead: ApiSetterLeadDetail }>(detailKey);
+      if (previous) {
+        qc.setQueryData(detailKey, { lead: { ...previous.lead, tags: data.tags } });
+      }
+    },
+  });
+}
+
+export interface SetterSlotDay {
+  date: string; // "YYYY-MM-DD"
+  slots: string[]; // ISO start times with offset
+}
+export interface SetterSlotsResponse {
+  ok: true;
+  timezone: string;
+  days: SetterSlotDay[];
+}
+
+// Live free-slot lookup for the cockpit's booking section (GET
+// /api/admin/setter/slots). Only fetched while a calendar name is entered,
+// and never retried: a 422 (calendar_not_found / needs_staff) is permanent
+// for this call, not transient, so the panel can show an honest message
+// instead of spinning.
+export function useSetterSlotsQuery(
+  tenantId: string,
+  calendarName: string,
+  days: number,
+  enabled: boolean,
+) {
+  return useQuery({
+    queryKey: ["admin", "setter", "slots", tenantId, calendarName, days],
+    enabled: enabled && !!tenantId && !!calendarName.trim(),
+    staleTime: 30_000,
+    retry: false,
+    queryFn: () =>
+      api<SetterSlotsResponse>(
+        `/api/admin/setter/slots?tenantId=${encodeURIComponent(tenantId)}&calendarName=${encodeURIComponent(calendarName)}&days=${days}`,
+      ),
+  });
+}
+
+export interface SetterBookInput {
+  tenantId: string;
+  calendarName: string;
+  contactId: string;
+  startTime: string;
+  endTime: string;
+  title?: string;
+}
+
+// Books a real appointment (POST /api/admin/setter/book). Deliberately
+// never retried: a retried POST here can double-book a real customer into a
+// real calendar (see functions/api/admin/setter/book.ts's header comment).
+// The default mutation retry is already 0 (src/lib/queryClient.ts), but this
+// stays explicit since it is a hard requirement, not an incidental default.
+// The caller (SlotPicker) must also disable its Book button while
+// isPending, so a double-click cannot fire the mutate function twice.
+export function useSetterBookMutation() {
+  const qc = useQueryClient();
+  return useMutation({
+    retry: false,
+    mutationFn: (input: SetterBookInput) =>
+      api<{ ok: boolean; id?: string }>("/api/admin/setter/book", {
+        method: "POST",
+        body: JSON.stringify(input),
+      }),
+    onSuccess: (_data, input) => {
+      qc.invalidateQueries({ queryKey: ["admin", "setter", "leads", input.tenantId] });
+      qc.invalidateQueries({ queryKey: ["calendar", "events"] });
+    },
+  });
+}
+
 // One client's full admin detail (business info, entitlements, staff,
 // GHL-identified members, recent activity) for the Service Delivery cockpit.
 // Keyed by tenantId so the header and the Overview tab (Task 3.3) mounting
 // side by side share one cached request instead of fetching twice.
 export function useAdminClientDetailQuery(tenantId: string, enabled = true) {
   return useQuery({
     queryKey: ["admin", "clients", tenantId],
     enabled: enabled && !!tenantId,
     staleTime: 30_000,
     queryFn: () => api<AdminClientDetailResponse>(`/api/admin/clients/${tenantId}`),
diff --git a/command-center/app/src/lib/api.ts b/command-center/app/src/lib/api.ts
index f6e4972..99e57af 100644
--- a/command-center/app/src/lib/api.ts
+++ b/command-center/app/src/lib/api.ts
@@ -902,10 +902,41 @@ export interface ApiSetterLead {
   lastOutcome: string | null;
 }
 
 export interface ApiSetterLeadsResponse {
   leads: ApiSetterLead[];
   // The leads endpoint caps at 1000 opportunities per pipeline
   // (functions/lib/ghl.ts fetchAllOpportunities, maxPages: 10 at 100/page).
   // The board must show this honestly rather than silently drop leads.
   truncated: boolean;
 }
+
+// One row of setter_dials, camelCased exactly as
+// functions/api/admin/setter/dials.ts:shapeDialRow returns it. Shared by the
+// lead detail endpoint (dials, newest first) and the dial-logging response.
+export interface ApiSetterDial {
+  id: string;
+  contactId: string;
+  opportunityId: string | null;
+  pipelineName: string | null;
+  stageName: string | null;
+  dialedAt: string;
+  spoke: boolean;
+  outcome: string;
+  note: string | null;
+  tagsApplied: string[];
+  createdBy: string | null;
+  createdAt: string;
+}
+
+// The cockpit's single-lead panel. Mirrors
+// functions/api/admin/setter/lead/[contactId].ts's ApiSetterLeadDetail
+// exactly: unlike ApiSetterLead (the board card), this DOES carry tags,
+// fetched from one contact so it costs nothing extra.
+export interface ApiSetterLeadDetail {
+  contactId: string;
+  name: string;
+  phone: string;
+  email: string;
+  tags: string[];
+  dials: ApiSetterDial[];
+}
diff --git a/command-center/app/src/lib/setterCockpit.test.ts b/command-center/app/src/lib/setterCockpit.test.ts
new file mode 100644
index 0000000..f23352c
--- /dev/null
+++ b/command-center/app/src/lib/setterCockpit.test.ts
@@ -0,0 +1,239 @@
+import { describe, it, expect } from "vitest";
+import {
+  OUTCOMES,
+  defaultSpokeForOutcome,
+  isContradictoryDial,
+  buildOptimisticDial,
+  isOptimisticDial,
+  prependOptimisticDial,
+  bumpLeadForDial,
+  formatSlotTime,
+  formatSlotDay,
+  computeSlotEnd,
+} from "./setterCockpit";
+import type { ApiSetterDial, ApiSetterLead } from "./api";
+
+describe("OUTCOMES", () => {
+  it("is exactly Jake's five outcomes, in order, mapped to the API's enum", () => {
+    expect(OUTCOMES.map((o) => o.value)).toEqual([
+      "booked",
+      "not_interested",
+      "no_answer",
+      "reschedule",
+      "bad_lead",
+    ]);
+    expect(OUTCOMES.map((o) => o.label)).toEqual([
+      "Booked",
+      "Not interested",
+      "No answer",
+      "Reschedule",
+      "Bad lead",
+    ]);
+  });
+});
+
+describe("defaultSpokeForOutcome", () => {
+  it("defaults to false for no_answer, since nobody picked up", () => {
+    expect(defaultSpokeForOutcome("no_answer")).toBe(false);
+  });
+  it("defaults to true for every other outcome", () => {
+    expect(defaultSpokeForOutcome("booked")).toBe(true);
+    expect(defaultSpokeForOutcome("not_interested")).toBe(true);
+    expect(defaultSpokeForOutcome("reschedule")).toBe(true);
+    expect(defaultSpokeForOutcome("bad_lead")).toBe(true);
+  });
+});
+
+describe("isContradictoryDial", () => {
+  it("mirrors the server's check: no_answer can never be paired with spoke true", () => {
+    expect(isContradictoryDial("no_answer", true)).toBe(true);
+  });
+  it("is not contradictory when no_answer pairs with spoke false", () => {
+    expect(isContradictoryDial("no_answer", false)).toBe(false);
+  });
+  it("is never contradictory for any other outcome, spoke true or false", () => {
+    expect(isContradictoryDial("booked", true)).toBe(false);
+    expect(isContradictoryDial("booked", false)).toBe(false);
+    expect(isContradictoryDial("reschedule", true)).toBe(false);
+  });
+});
+
+describe("buildOptimisticDial / isOptimisticDial", () => {
+  it("builds a dial row shaped exactly like the server's, tagged with a temp id", () => {
+    const dial = buildOptimisticDial(
+      {
+        contactId: "c1",
+        opportunityId: "o1",
+        pipelineName: "Sales Pipeline",
+        stageName: "Hot Lead",
+        spoke: true,
+        outcome: "booked",
+        note: "Wants a morning slot",
+        tagsApplied: ["hot"],
+      },
+      "2026-07-20T12:00:00.000Z",
+      "optimistic-1",
+    );
+    expect(dial).toEqual({
+      id: "optimistic-1",
+      contactId: "c1",
+      opportunityId: "o1",
+      pipelineName: "Sales Pipeline",
+      stageName: "Hot Lead",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+      spoke: true,
+      outcome: "booked",
+      note: "Wants a morning slot",
+      tagsApplied: ["hot"],
+      createdBy: null,
+      createdAt: "2026-07-20T12:00:00.000Z",
+    });
+  });
+
+  it("defaults optional fields to null/empty, matching the server shape", () => {
+    const dial = buildOptimisticDial(
+      { contactId: "c1", spoke: false, outcome: "no_answer" },
+      "2026-07-20T12:00:00.000Z",
+      "optimistic-2",
+    );
+    expect(dial.opportunityId).toBeNull();
+    expect(dial.pipelineName).toBeNull();
+    expect(dial.stageName).toBeNull();
+    expect(dial.note).toBeNull();
+    expect(dial.tagsApplied).toEqual([]);
+  });
+
+  it("isOptimisticDial recognizes a temp id and rejects a real server id", () => {
+    expect(isOptimisticDial("optimistic-1")).toBe(true);
+    expect(isOptimisticDial("9c6f7c1e-real-uuid")).toBe(false);
+  });
+});
+
+describe("prependOptimisticDial", () => {
+  it("puts the new dial first, newest-first order matching the server", () => {
+    const existing: ApiSetterDial[] = [
+      {
+        id: "d1",
+        contactId: "c1",
+        opportunityId: null,
+        pipelineName: null,
+        stageName: null,
+        dialedAt: "2026-07-19T12:00:00.000Z",
+        spoke: false,
+        outcome: "no_answer",
+        note: null,
+        tagsApplied: [],
+        createdBy: "admin1",
+        createdAt: "2026-07-19T12:00:00.000Z",
+      },
+    ];
+    const fresh: ApiSetterDial = {
+      id: "optimistic-1",
+      contactId: "c1",
+      opportunityId: null,
+      pipelineName: null,
+      stageName: null,
+      dialedAt: "2026-07-20T12:00:00.000Z",
+      spoke: true,
+      outcome: "booked",
+      note: null,
+      tagsApplied: [],
+      createdBy: null,
+      createdAt: "2026-07-20T12:00:00.000Z",
+    };
+    expect(prependOptimisticDial(existing, fresh)).toEqual([fresh, existing[0]]);
+  });
+});
+
+describe("bumpLeadForDial", () => {
+  const baseLead: ApiSetterLead = {
+    id: "opp1",
+    contactId: "c1",
+    name: "Jane Doe",
+    phone: "5551234567",
+    city: "Garden City",
+    stageName: "Needs Dialing",
+    createdAt: "2026-07-18T00:00:00.000Z",
+    attempts: 0,
+    firstDialedAt: null,
+    contacted: false,
+    lastOutcome: null,
+  };
+
+  it("increments attempts and sets lastOutcome to the new dial's outcome", () => {
+    const next = bumpLeadForDial(baseLead, {
+      spoke: false,
+      outcome: "no_answer",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+    });
+    expect(next.attempts).toBe(1);
+    expect(next.lastOutcome).toBe("no_answer");
+  });
+
+  it("sets contacted true when the dial was a spoke-with, and sets firstDialedAt when it was null", () => {
+    const next = bumpLeadForDial(baseLead, {
+      spoke: true,
+      outcome: "booked",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+    });
+    expect(next.contacted).toBe(true);
+    expect(next.firstDialedAt).toBe("2026-07-20T12:00:00.000Z");
+  });
+
+  it("never turns contacted back off, even when the new dial itself did not spoke", () => {
+    const contactedLead = { ...baseLead, contacted: true, attempts: 2 };
+    const next = bumpLeadForDial(contactedLead, {
+      spoke: false,
+      outcome: "no_answer",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+    });
+    expect(next.contacted).toBe(true);
+  });
+
+  it("leaves an existing firstDialedAt untouched", () => {
+    const dialed = { ...baseLead, firstDialedAt: "2026-01-01T00:00:00.000Z", attempts: 1 };
+    const next = bumpLeadForDial(dialed, {
+      spoke: true,
+      outcome: "booked",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+    });
+    expect(next.firstDialedAt).toBe("2026-01-01T00:00:00.000Z");
+  });
+
+  it("does not mutate the original lead object", () => {
+    const next = bumpLeadForDial(baseLead, {
+      spoke: true,
+      outcome: "booked",
+      dialedAt: "2026-07-20T12:00:00.000Z",
+    });
+    expect(baseLead.attempts).toBe(0);
+    expect(next).not.toBe(baseLead);
+  });
+});
+
+describe("formatSlotTime", () => {
+  it("renders the wall-clock time encoded in the slot's own offset", () => {
+    expect(formatSlotTime("2026-07-08T12:00:00-04:00")).toBe("12:00 PM");
+    expect(formatSlotTime("2026-07-08T09:30:00-04:00")).toBe("9:30 AM");
+    expect(formatSlotTime("2026-07-08T00:15:00-04:00")).toBe("12:15 AM");
+  });
+});
+
+describe("formatSlotDay", () => {
+  it("renders a short weekday + month + day label, independent of viewer timezone", () => {
+    expect(formatSlotDay("2026-07-08")).toBe("Wed, Jul 8");
+  });
+});
+
+describe("computeSlotEnd", () => {
+  it("adds the duration in minutes to the start instant", () => {
+    expect(computeSlotEnd("2026-07-08T12:00:00.000Z", 60)).toBe(
+      "2026-07-08T13:00:00.000Z",
+    );
+  });
+  it("handles non-hour durations", () => {
+    expect(computeSlotEnd("2026-07-08T12:00:00.000Z", 30)).toBe(
+      "2026-07-08T12:30:00.000Z",
+    );
+  });
+});
diff --git a/command-center/app/src/lib/setterCockpit.ts b/command-center/app/src/lib/setterCockpit.ts
new file mode 100644
index 0000000..21ccaf0
--- /dev/null
+++ b/command-center/app/src/lib/setterCockpit.ts
@@ -0,0 +1,147 @@
+// Pure model + reducer helpers for the Setter Suite cockpit
+// (src/components/admin/setter/SetterCockpit.tsx, DialLogger.tsx,
+// SlotPicker.tsx). No I/O, no React: everything here is a plain function of
+// the API's own shapes, so the outcome-to-spoke default, the optimistic dial
+// reducer, and the slot/day formatting stay unit-testable without a server,
+// a browser, or React Query.
+
+import type { ApiSetterDial, ApiSetterLead } from "./api";
+
+// Jake's five outcomes, exact wording and order, mapped to the API's own
+// enum (functions/api/admin/setter/dials.ts OUTCOMES). Never reworded, never
+// a sixth added: the DB has a check constraint on these exact values.
+export const OUTCOMES = [
+  { value: "booked", label: "Booked" },
+  { value: "not_interested", label: "Not interested" },
+  { value: "no_answer", label: "No answer" },
+  { value: "reschedule", label: "Reschedule" },
+  { value: "bad_lead", label: "Bad lead" },
+] as const;
+
+export type SetterOutcome = (typeof OUTCOMES)[number]["value"];
+
+// The API rejects outcome "no_answer" paired with spoke: true (see
+// functions/api/admin/setter/dials.ts:validateDialBody, code
+// "contradictory"): nobody picked up, so nobody was spoken to. Every other
+// outcome defaults to spoke: true, someone was reached. The setter can still
+// flip the visible override before submitting.
+export function defaultSpokeForOutcome(outcome: string): boolean {
+  return outcome !== "no_answer";
+}
+
+// Mirrors the server's own contradiction check, so the client can block a
+// bad submit before it ever reaches the network and can recognize the
+// server's "contradictory" error code if one slips through anyway (a stale
+// tab, a race with another setter).
+export function isContradictoryDial(outcome: string, spoke: boolean): boolean {
+  return outcome === "no_answer" && spoke === true;
+}
+
+// Every optimistic dial's id carries this prefix so it is unambiguous which
+// rows in a cached dial list are provisional. A real setter_dials row is a
+// Postgres uuid and can never collide with it.
+export const OPTIMISTIC_DIAL_PREFIX = "optimistic-";
+
+export function isOptimisticDial(id: string): boolean {
+  return id.startsWith(OPTIMISTIC_DIAL_PREFIX);
+}
+
+export interface OptimisticDialInput {
+  contactId: string;
+  opportunityId?: string | null;
+  pipelineName?: string | null;
+  stageName?: string | null;
+  spoke: boolean;
+  outcome: string;
+  note?: string | null;
+  tagsApplied?: string[];
+}
+
+// Shapes a freshly logged dial exactly like the server's ApiSetterDial
+// (functions/api/admin/setter/dials.ts:shapeDialRow), before the real row
+// exists, so it renders in the timeline with no special-casing.
+export function buildOptimisticDial(
+  input: OptimisticDialInput,
+  nowIso: string,
+  tempId: string,
+): ApiSetterDial {
+  return {
+    id: tempId,
+    contactId: input.contactId,
+    opportunityId: input.opportunityId ?? null,
+    pipelineName: input.pipelineName ?? null,
+    stageName: input.stageName ?? null,
+    dialedAt: nowIso,
+    spoke: input.spoke,
+    outcome: input.outcome,
+    note: input.note ?? null,
+    tagsApplied: input.tagsApplied ?? [],
+    createdBy: null,
+    createdAt: nowIso,
+  };
+}
+
+// The lead detail's dial-history reducer: newest first, matching the
+// server's own `.order("dialed_at", { ascending: false })`, so a fresh dial
+// lands exactly where the next real fetch would put it.
+export function prependOptimisticDial(
+  dials: ApiSetterDial[],
+  dial: ApiSetterDial,
+): ApiSetterDial[] {
+  return [dial, ...dials];
+}
+
+// The board card's own reducer for one new dial. Mirrors
+// functions/lib/setterMetrics.ts:rollUpByContact applied to a single append,
+// so the optimistic bump agrees with what the server will compute on the
+// next real fetch: attempts always increments; contacted only ever turns on
+// (never off, a past spoke-with stays true); lastOutcome always becomes the
+// new dial's outcome, since by construction it is the newest; firstDialedAt
+// is set only the first time.
+export function bumpLeadForDial(
+  lead: ApiSetterLead,
+  dial: { spoke: boolean; outcome: string; dialedAt: string },
+): ApiSetterLead {
+  return {
+    ...lead,
+    attempts: lead.attempts + 1,
+    contacted: lead.contacted || dial.spoke,
+    lastOutcome: dial.outcome,
+    firstDialedAt: lead.firstDialedAt ?? dial.dialedAt,
+  };
+}
+
+// Display the wall-clock time encoded in the slot's own offset (e.g. the
+// "12:00" in "2026-07-08T12:00:00-04:00"), so the label matches the
+// business's local calendar regardless of the viewer's timezone. Mirrors
+// src/components/SlotPickerModal.tsx's slotLabel; kept separate rather than
+// imported so this admin surface never touches that client-facing modal.
+export function formatSlotTime(iso: string): string {
+  const hm = iso.slice(11, 16);
+  const [hRaw, m] = hm.split(":");
+  let h = Number(hRaw);
+  const ap = h >= 12 ? "PM" : "AM";
+  h = h % 12;
+  if (h === 0) h = 12;
+  return `${h}:${m} ${ap}`;
+}
+
+// "YYYY-MM-DD" -> "Wed, Jul 8", parsed as UTC so the calendar date never
+// shifts a day under the viewer's own timezone offset.
+export function formatSlotDay(date: string): string {
+  const [y, mo, d] = date.split("-").map(Number);
+  const dt = new Date(Date.UTC(y, mo - 1, d));
+  return dt.toLocaleDateString("en-US", {
+    weekday: "short",
+    month: "short",
+    day: "numeric",
+    timeZone: "UTC",
+  });
+}
+
+// End time = start instant + duration, as an ISO string. GHL parses any
+// valid ISO 8601 instant, so a UTC end paired with an offset start is
+// accepted (mirrors SlotPickerModal's endFrom).
+export function computeSlotEnd(startIso: string, minutes: number): string {
+  return new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();
+}
diff --git a/command-center/app/src/routes/admin/SetterSuite.tsx b/command-center/app/src/routes/admin/SetterSuite.tsx
index 92273b9..d66fd91 100644
--- a/command-center/app/src/routes/admin/SetterSuite.tsx
+++ b/command-center/app/src/routes/admin/SetterSuite.tsx
@@ -1,29 +1,26 @@
 import { useState } from "react";
 import {
   useAdminClientsQuery,
   useSetterPipelinesQuery,
   useSetterLeadsQuery,
 } from "../../hooks/useApi";
 import { useNow } from "../../context/NowContext";
 import SetterBoard from "../../components/admin/setter/SetterBoard";
+import SetterCockpit from "../../components/admin/setter/SetterCockpit";
 import type { ApiSetterLead } from "../../lib/api";
 
 // /admin/setter: the Setter Suite. One client's leads worked across every one
 // of that client's pipelines, unfiltered (unlike the client-facing app, which
 // hides retired/system pipelines and stages). Pipeline tabs across the top,
-// the real stage columns underneath.
-//
-// Selecting a card only tracks which lead is active and fires onSelectLead;
-// the docked cockpit that reads that selection (dial logging, tags, booking)
-// is a separate later build. Nothing here renders a side panel yet, but the
-// selection state and the callback are the seam it plugs into.
+// the real stage columns underneath, and a docked cockpit (dial logging,
+// tags, booking) on the right whenever a card is selected.
 export default function SetterSuite() {
   const clientsQuery = useAdminClientsQuery(true);
   const clients = clientsQuery.data?.clients ?? [];
 
   const [tenantId, setTenantId] = useState<string | null>(null);
   const activeTenantId = tenantId ?? clients[0]?.id ?? null;
   const activeClient = clients.find((c) => c.id === activeTenantId) ?? null;
 
   const pipelinesQuery = useSetterPipelinesQuery(activeTenantId ?? "", !!activeTenantId);
   const pipelines = pipelinesQuery.data?.pipelines ?? [];
@@ -49,20 +46,22 @@ export default function SetterSuite() {
 
   const selectPipeline = (id: string) => {
     setPipelineId(id);
     setSelectedLead(null);
   };
 
   const selectLead = (lead: ApiSetterLead) => {
     setSelectedLead((prev) => (prev?.id === lead.id ? null : lead));
   };
 
+  const closeCockpit = () => setSelectedLead(null);
+
   return (
     <div className="pk-root">
       <div className="flex flex-wrap items-start justify-between gap-4">
         <div>
           <div className="pk-kicker">Sales / Setter Suite</div>
           <h1 className="pk-title">Setter Suite</h1>
           <p className="pk-tagline">
             Work one client&apos;s leads across every pipeline, live from the booking system.
           </p>
         </div>
@@ -111,24 +110,38 @@ export default function SetterSuite() {
             <div className="pk-empty">Loading pipelines...</div>
           ) : pipelinesQuery.isError ? (
             <div className="pk-empty">Could not load pipelines for {activeClient.name}.</div>
           ) : !activePipeline ? (
             <div className="pk-empty">No pipelines found for {activeClient.name}.</div>
           ) : leadsQuery.isLoading ? (
             <div className="pk-empty">Loading leads...</div>
           ) : leadsQuery.isError ? (
             <div className="pk-empty">Could not load leads for {activePipeline.name}.</div>
           ) : (
-            <SetterBoard
-              pipeline={activePipeline}
-              leads={leadsQuery.data?.leads ?? []}
-              truncated={leadsQuery.data?.truncated ?? false}
-              now={now}
-              selectedLeadId={selectedLead?.id ?? null}
-              onSelectLead={selectLead}
-            />
+            <div className="flex items-start gap-4">
+              <div className="min-w-0 flex-1">
+                <SetterBoard
+                  pipeline={activePipeline}
+                  leads={leadsQuery.data?.leads ?? []}
+                  truncated={leadsQuery.data?.truncated ?? false}
+                  now={now}
+                  selectedLeadId={selectedLead?.id ?? null}
+                  onSelectLead={selectLead}
+                />
+              </div>
+              {selectedLead && activeTenantId && (
+                <SetterCockpit
+                  key={selectedLead.id}
+                  tenantId={activeTenantId}
+                  pipelineId={activePipelineId ?? ""}
+                  pipelineName={activePipeline.name}
+                  lead={selectedLead}
+                  onClose={closeCockpit}
+                />
+              )}
+            </div>
           )}
         </>
       )}
     </div>
   );
 }
```
