import { useState } from "react";
import { RefreshCw, Check } from "lucide-react";
import { Panel, Button } from "../ui";
import { Switch } from "../ui/Switch";
import { cn } from "../../lib/cn";
import { useRecurrence } from "../../hooks/useRecurrence";
import { useToast } from "../../context/ToastContext";
import { occurrences, nextVisit, type RecurrenceRule } from "../../lib/recurrence";
import { toIso, isoToLocalDate } from "../../lib/jobsPipeline";
import type { CustomerWithSchedule } from "../../lib/customers";

// The recurring-schedule editor for a single customer. An Active / Off toggle;
// when active it exposes the cadence pills, the weekday picker, service + price
// inputs and a live "Next 3 visits" preview (derived from occurrences over the
// next 90 days). Saving upserts the recurrence row; turning it off (or
// "Cancel recurring") removes it. A one-time customer starts on an empty state
// with a "Set up recurring" call to action that flips the editor on.
//
// Local editor state is seeded from the selected customer. The parent mounts
// this with `key={customer.id}` so switching customers re-seeds cleanly.

const WD_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const WD_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const CADENCES: { weeks: number; label: string }[] = [
  { weeks: 1, label: "Weekly" },
  { weeks: 2, label: "Every 2 weeks" },
  { weeks: 4, label: "Every 4 weeks" },
];

function cadencePhrase(weeks: number, weekday: number): string {
  const prefix = weeks === 1 ? "" : weeks === 2 ? "other " : `${weeks}th `;
  return `every ${prefix}${WD_FULL[weekday]}`;
}

function visitLabel(iso: string): { date: string; weekday: string } {
  const d = isoToLocalDate(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    weekday: WD_FULL[d.getDay()],
  };
}

export default function RecurringScheduleEditor({
  customer,
  todayIso,
}: {
  customer: CustomerWithSchedule;
  todayIso: string;
}) {
  const { upsert, remove } = useRecurrence();
  const { showToast } = useToast();

  const seededPrice =
    customer.priceCents != null
      ? String(customer.priceCents / 100)
      : customer.jobs[0]
        ? String(customer.jobs[0].amount)
        : "";

  const [active, setActive] = useState(customer.segment === "recurring");
  const [cadenceWeeks, setCadenceWeeks] = useState(
    customer.rule?.cadenceWeeks ?? 2,
  );
  const [weekday, setWeekday] = useState(customer.rule?.weekday ?? 2);
  const [service, setService] = useState(
    customer.service ?? customer.jobs[0]?.service ?? "",
  );
  const [price, setPrice] = useState(seededPrice);

  const firstName = customer.name.split(" ")[0];

  // Preview rule anchored to today; occurrences normalizes forward to the
  // chosen weekday, so the first result is the next matching visit.
  const previewRule: RecurrenceRule = {
    cadenceWeeks,
    weekday,
    anchorDate: todayIso,
  };
  const endDate = isoToLocalDate(todayIso);
  endDate.setDate(endDate.getDate() + 90);
  const visits = occurrences(previewRule, todayIso, toIso(endDate)).slice(0, 3);

  function parsePriceCents(): number | null {
    const parsed = parseFloat(price.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  }

  function handleSave() {
    const rule: RecurrenceRule = { cadenceWeeks, weekday, anchorDate: todayIso };
    upsert.mutate(
      {
        contactId: customer.id,
        cadenceWeeks,
        weekday,
        anchorDate: nextVisit(rule, todayIso),
        visitTime: null,
        service: service.trim() || null,
        priceCents: parsePriceCents(),
        active: true,
      },
      {
        onSuccess: () => {
          setActive(true);
          showToast("Schedule saved");
        },
        onError: () => showToast("Could not save the schedule. Please try again."),
      },
    );
  }

  function handleCancel() {
    if (customer.segment !== "recurring") {
      setActive(false);
      return;
    }
    remove.mutate(
      { contactId: customer.id },
      {
        onSuccess: () => {
          setActive(false);
          showToast("Recurring schedule turned off");
        },
        onError: () => showToast("Could not turn off the schedule. Please try again."),
      },
    );
  }

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-divider px-4 py-3.5">
        <RefreshCw size={16} className="text-brand-text" aria-hidden />
        <span className="font-display text-[14.5px] font-semibold text-text">
          Recurring schedule
        </span>
        <span className="ml-auto flex items-center gap-2.5 text-[12px] font-semibold text-muted">
          {active ? "Active" : "Off"}
          <Switch
            checked={active}
            onChange={(next) => (next ? setActive(true) : handleCancel())}
            label="Recurring schedule active"
          />
        </span>
      </div>

      {active ? (
        <div className="flex flex-col gap-4 p-[18px]">
          {/* Cadence */}
          <div>
            <label className="mb-[7px] block text-[11.5px] font-semibold text-muted">
              How often?
            </label>
            <div className="flex flex-wrap gap-2">
              {CADENCES.map((c) => {
                const on = cadenceWeeks === c.weeks;
                return (
                  <button
                    key={c.weeks}
                    type="button"
                    onClick={() => setCadenceWeeks(c.weeks)}
                    className={cn(
                      "rounded-[9px] border px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
                      on
                        ? "border-brand bg-brand-tint text-brand-text"
                        : "border-border bg-surface text-muted hover:text-text",
                    )}
                    aria-pressed={on}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Weekday */}
          <div>
            <label className="mb-[7px] block text-[11.5px] font-semibold text-muted">
              Which day?
            </label>
            <div className="flex gap-1.5">
              {WD_SHORT.map((d, i) => {
                const on = weekday === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setWeekday(i)}
                    className={cn(
                      "grid h-[38px] w-[38px] place-items-center rounded-[10px] border text-[12.5px] font-bold transition-colors",
                      on
                        ? "border-transparent text-white shadow-brand"
                        : "border-border bg-surface text-muted hover:text-text",
                    )}
                    style={on ? { backgroundImage: "var(--grad-brand)" } : undefined}
                    aria-pressed={on}
                    aria-label={WD_FULL[i]}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Service + price */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-[7px] block text-[11.5px] font-semibold text-muted">
                Service
              </label>
              <input
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder="What gets done"
                className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>
            <div>
              <label className="mb-[7px] block text-[11.5px] font-semibold text-muted">
                Price per visit
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13.5px] text-faint">
                  $
                </span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-full rounded-[10px] border border-border bg-surface py-2.5 pl-6 pr-3 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-[12px] bg-surface-2 px-4 py-3.5">
            <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-faint">
              Next 3 visits · {cadencePhrase(cadenceWeeks, weekday)}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {visits.map((iso) => {
                const v = visitLabel(iso);
                return (
                  <div
                    key={iso}
                    className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2"
                  >
                    <span
                      className="h-2 w-2 rounded-full bg-brand"
                      aria-hidden
                    />
                    <div>
                      <div className="font-display text-[13px] font-semibold text-text">
                        {v.date}
                      </div>
                      <div className="text-[11px] text-faint">{v.weekday}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2.5">
            <Button variant="primary" onClick={handleSave} loading={upsert.isPending}>
              <Check size={16} />
              Save schedule
            </Button>
            <Button variant="ghost" onClick={handleCancel}>
              Cancel recurring
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-[18px] py-[26px] text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-[12px] bg-brand-tint text-brand-text">
            <RefreshCw size={22} />
          </div>
          <div className="font-display text-[15px] font-semibold text-text">
            No recurring schedule
          </div>
          <p className="mx-auto mb-3.5 mt-1.5 max-w-[320px] text-[12.5px] text-muted">
            {firstName} is a one-time customer. Turn on a schedule to book their
            visits automatically and feed the Jobs calendar.
          </p>
          <Button variant="primary" onClick={() => setActive(true)}>
            <RefreshCw size={16} />
            Set up recurring
          </Button>
        </div>
      )}
    </Panel>
  );
}
