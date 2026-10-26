import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { cn } from "../../../../../lib/cn";
import { SopButton } from "../../../sop/sopKit";
import { useCalendarSync, useClientCalendarsQuery, useSetBlockedCalendars } from "../../../../../hooks/useApi";
import { useGhlCalendars, useGhlForm, useSaveGhlCalendar } from "../../../../../hooks/useGhlSetup";
import type { CalendarPatch, DayRange, FormFacts, SetupCalendar, StaffUser } from "../../../../../../functions/lib/ghlSetup";
import { Avatar, Chip, ErrorLine, Field, GhlPage, IconBtn, OpenInGhl, PageState, Panel, SaveButton, Table, TD, Toggle, samePhone } from "./kit";

// GHL Calendars > Calendar Settings: the calendars table, and the calendar
// editor with its left-hand sections. Checklist B5: the owner on each calendar
// (the snapshot leaves them empty), hours from the onboarding form, Sunday off
// unless the form gives Sunday hours, and auto-confirm ON for Home Estimate and
// Job (the Appointments, CAPI and Outcomes workflows only fire on "confirmed")
// but OFF for Phone Appointment (the workflow confirms when the lead replies).
//
// The Google column is the old Calendars page's switch: whether the owner's own
// Google busy time blocks this calendar (functions/lib/calendarSync.ts).

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Hours = SetupCalendar["hours"];

const SECTIONS = [
  { id: "details", label: "Meeting Details" },
  { id: "availability", label: "Availability" },
  { id: "options", label: "Additional Options" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

const wantsConfirm = (c: SetupCalendar) => !/phone/i.test(c.name);
const formHours = (f: FormFacts | null): Hours | null => (f?.hours ? f.hours.map((d) => (d ? [d as DayRange] : null)) : null);
const hoursKey = (h: Hours) => h.map((d) => (d ? d.map((r) => r.join("-")).join(",") : "x")).join("|");

function ownerOf(users: StaffUser[], facts: FormFacts | null): StaffUser | null {
  if (!facts) return null;
  return users.find((u) => (!!facts.email && u.email.toLowerCase() === facts.email.toLowerCase()) || samePhone(u.phone, facts.phone)) ?? null;
}

function problems(c: SetupCalendar, facts: FormFacts | null): string[] {
  if (!c.active) return [];
  const out: string[] = [];
  if (!c.team.length) out.push("No team member");
  const fh = formHours(facts);
  if (fh && hoursKey(fh) !== hoursKey(c.hours)) out.push("Hours differ from the form");
  if (c.autoConfirm !== wantsConfirm(c)) out.push(wantsConfirm(c) ? "Auto-confirm must be on" : "Auto-confirm must be off");
  return out;
}

const to12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};

export default function CalendarsPage({ tenantId, locationId }: { tenantId: string; locationId: string }) {
  const q = useGhlCalendars(tenantId);
  const facts = useGhlForm(tenantId).data?.facts ?? null;
  const save = useSaveGhlCalendar(tenantId);
  const google = useClientCalendarsQuery(tenantId);
  const saveBusy = useSetBlockedCalendars(tenantId);
  const sync = useCalendarSync(tenantId);
  const [open, setOpen] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<unknown>(null);

  // Same as the old page: bring GHL's busy blocks up to date once per visit.
  const synced = useRef("");
  useEffect(() => {
    if (!google.data?.googleLinked || synced.current === tenantId) return;
    synced.current = tenantId;
    sync.mutate();
  }, [google.data?.googleLinked, tenantId, sync]);

  if (!q.data) return <PageState title="Calendar Settings" loading={q.isLoading} error={q.error} />;
  const { calendars, users } = q.data;
  const owner = ownerOf(users, facts);
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}`.trim() : "Unknown user";
  };
  const total = calendars.reduce((n, c) => n + problems(c, facts).length, 0);
  const cal = calendars.find((c) => c.id === open);

  const blocked = (id: string) => google.data?.calendars.find((g) => g.id === id)?.blocked ?? false;
  const toggleBusy = (c: SetupCalendar) => {
    const chosen = calendars.filter((x) => (x.id === c.id ? !blocked(c.id) : blocked(x.id)));
    saveBusy.mutate({ calendarIds: chosen.map((x) => x.id), names: chosen.map((x) => ({ id: x.id, name: x.name })) }, { onSuccess: () => sync.mutate() });
  };

  // Every live calendar to the checklist in one go, one write per calendar.
  const fixAll = async () => {
    setFixing(true);
    setFixError(null);
    try {
      for (const c of calendars) {
        if (!problems(c, facts).length) continue;
        const patch: CalendarPatch = {};
        if (!c.team.length && owner) patch.team = [owner.id];
        const fh = formHours(facts);
        if (fh && hoursKey(fh) !== hoursKey(c.hours)) patch.hours = fh;
        if (c.autoConfirm !== wantsConfirm(c)) patch.autoConfirm = wantsConfirm(c);
        if (Object.keys(patch).length) await save.mutateAsync({ id: c.id, patch });
      }
    } catch (err) {
      setFixError(err);
    } finally {
      setFixing(false);
    }
  };

  if (cal) {
    return (
      <CalendarEditor
        key={cal.id}
        cal={cal}
        users={users}
        owner={owner}
        facts={facts}
        locationId={locationId}
        saving={save.isPending}
        error={save.error}
        onBack={() => setOpen(null)}
        onSave={(patch) => save.mutate({ id: cal.id, patch })}
      />
    );
  }

  return (
    <GhlPage
      title="Calendar Settings"
      status={
        <>
          {total ? <Chip tone="warn">{total} to fix</Chip> : <Chip tone="ok">All set</Chip>}
          {facts && !owner && <Chip tone="warn">Owner not on Staff</Chip>}
        </>
      }
      actions={
        <>
          <SopButton disabled={!total || fixing} onClick={() => void fixAll()}>
            {fixing ? "Setting..." : "Set all from the form"}
          </SopButton>
          <OpenInGhl locationId={locationId} path="settings/calendars" />
        </>
      }
    >
      <ErrorLine error={fixError ?? save.error ?? saveBusy.error} />
      <Table head={["Name", "Team", "Hours", "Auto-confirm", "Google busy", "Active", "", ""]}>
        {calendars.map((c) => {
          const issues = problems(c, facts);
          const openDays = c.hours.map((d, i) => (d ? DAYS[i].slice(0, 3) : null)).filter(Boolean);
          return (
            <tr key={c.id}>
              <td className={TD}>
                <button type="button" onClick={() => setOpen(c.id)} className="font-semibold text-text hover:text-brand-text">
                  {c.name}
                </button>
              </td>
              <td className={TD}>
                {c.team.length ? (
                  <span className="flex flex-wrap gap-1">
                    {c.team.map((id) => (
                      <Chip key={id}>{nameOf(id)}</Chip>
                    ))}
                  </span>
                ) : (
                  <Chip tone="warn">No one</Chip>
                )}
              </td>
              <td className={`${TD} text-[12.5px] text-muted`}>{openDays.length ? openDays.join(", ") : "Closed"}</td>
              <td className={TD}>
                <Chip tone={c.autoConfirm === wantsConfirm(c) ? "ok" : "warn"}>{c.autoConfirm ? "On" : "Off"}</Chip>
              </td>
              <td className={TD}>
                <Toggle on={blocked(c.id)} onChange={() => toggleBusy(c)} label={`${c.name} blocked by Google busy time`} />
              </td>
              <td className={TD}>
                <Toggle on={c.active} onChange={(active) => save.mutate({ id: c.id, patch: { active } })} label={`${c.name} active`} />
              </td>
              <td className={TD}>{c.active && (issues.length ? <Chip tone="warn">{issues.length} to fix</Chip> : <Chip tone="ok">Ready</Chip>)}</td>
              <td className={`${TD} w-[50px]`}>
                <IconBtn label="Edit" onClick={() => setOpen(c.id)}>
                  <Pencil size={14} aria-hidden />
                </IconBtn>
              </td>
            </tr>
          );
        })}
      </Table>
    </GhlPage>
  );
}

function CalendarEditor({
  cal,
  users,
  owner,
  facts,
  locationId,
  saving,
  error,
  onBack,
  onSave,
}: {
  cal: SetupCalendar;
  users: StaffUser[];
  owner: StaffUser | null;
  facts: FormFacts | null;
  locationId: string;
  saving: boolean;
  error: unknown;
  onBack: () => void;
  onSave: (patch: CalendarPatch) => void;
}) {
  const [section, setSection] = useState<Section>("details");
  const [d, setD] = useState(cal);
  useEffect(() => setD(cal), [cal]);
  const issues = problems(d, facts);
  const fh = formHours(facts);
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}`.trim() : "Unknown user";
  };

  const patch: CalendarPatch = {};
  if (d.name !== cal.name) patch.name = d.name;
  if (d.team.join() !== cal.team.join()) patch.team = d.team;
  if (hoursKey(d.hours) !== hoursKey(cal.hours)) patch.hours = d.hours;
  if (d.autoConfirm !== cal.autoConfirm) patch.autoConfirm = d.autoConfirm;
  for (const k of ["slotDuration", "slotBuffer", "noticeHours", "rangeDays"] as const) if (d[k] !== cal[k] && d[k] !== null) patch[k] = d[k]!;
  if (d.perDay !== cal.perDay) patch.perDay = d.perDay;
  const dirty = Object.keys(patch).length > 0;

  const setDay = (i: number, v: DayRange[] | null) => setD((x) => ({ ...x, hours: x.hours.map((h, j) => (j === i ? v : h)) }));
  const numField = (k: "slotDuration" | "slotBuffer" | "noticeHours" | "rangeDays" | "perDay", label: string) => (
    <Field
      label={label}
      type="number"
      value={d[k] === null ? "" : String(d[k])}
      onChange={(v) => setD((x) => ({ ...x, [k]: v === "" ? null : Math.max(0, Number(v)) }))}
    />
  );

  return (
    <GhlPage
      title={cal.name}
      status={issues.length ? <Chip tone="warn">{issues.length} to fix</Chip> : <Chip tone="ok">Ready</Chip>}
      actions={
        <>
          <SopButton onClick={onBack}>
            <ArrowLeft size={13} aria-hidden /> Calendars
          </SopButton>
          <OpenInGhl locationId={locationId} path="settings/calendars" />
          <SaveButton busy={saving} disabled={!dirty} onClick={() => onSave(patch)} />
        </>
      }
    >
      <ErrorLine error={error} />
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-0.5 self-start rounded-lg border border-border bg-surface p-1.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={cn("rounded-[var(--radius)] px-3 py-2 text-left text-[13px] font-semibold", section === s.id ? "bg-brand-tint text-brand-text" : "text-muted hover:bg-surface-2 hover:text-text")}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {section === "details" && (
          <Panel title="Meeting Details">
            <div className="flex flex-col gap-4">
              <Field label="Calendar Name" value={d.name} onChange={(name) => setD((x) => ({ ...x, name }))} />
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-muted">Team Members</span>
                <div className="flex flex-wrap items-center gap-2">
                  {d.team.map((id) => (
                    <span key={id} className="inline-flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2.5 text-[12.5px] font-semibold capitalize text-text">
                      <Avatar name={nameOf(id)} /> {nameOf(id)}
                      {d.team.length > 1 && (
                        <button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => setD((x) => ({ ...x, team: x.team.filter((t) => t !== id) }))} className="text-faint hover:text-danger">
                          <X size={12} aria-hidden />
                        </button>
                      )}
                    </span>
                  ))}
                  {users
                    .filter((u) => !d.team.includes(u.id))
                    .map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setD((x) => ({ ...x, team: [...x.team, u.id] }))}
                        className={cn(
                          "rounded-full border border-dashed px-3 py-1.5 text-[12.5px] font-semibold capitalize",
                          owner?.id === u.id && !d.team.length ? "border-warning text-warning hover:bg-warning-tint" : "border-border-strong text-muted hover:border-brand hover:text-text",
                        )}
                      >
                        + {u.firstName} {u.lastName}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </Panel>
        )}

        {section === "availability" && (
          <Panel title="Availability" right={fh && hoursKey(fh) !== hoursKey(d.hours) ? <SopButton onClick={() => setD((x) => ({ ...x, hours: fh }))}>Use form hours</SopButton> : undefined}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {DAYS.map((day, i) => {
                  const ranges = d.hours[i];
                  const want = fh?.[i] ?? null;
                  const off = !!fh && (ranges?.map((r) => r.join("-")).join(",") ?? "") !== (want?.map((r) => r.join("-")).join(",") ?? "");
                  return (
                    <div key={day} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <Toggle on={!!ranges} onChange={(on) => setDay(i, on ? [want?.[0] ?? ["08:00", "17:00"]] : null)} label={day} />
                      <span className="w-[100px] text-[13px] font-semibold text-text">{day}</span>
                      {ranges ? (
                        <span className="flex flex-col gap-1.5">
                          {ranges.map((r, ri) => (
                            <span key={ri} className="flex items-center gap-2">
                              {[0, 1].map((side) => (
                                <input
                                  key={side}
                                  type="time"
                                  value={r[side]}
                                  onChange={(e) => setDay(i, ranges.map((x, xi) => (xi === ri ? ((side === 0 ? [e.target.value, x[1]] : [x[0], e.target.value]) as DayRange) : x)))}
                                  className={cn("rounded-[var(--radius)] border bg-surface px-2 py-1 font-data text-[12.5px] text-text", off ? "border-warning" : "border-border")}
                                />
                              ))}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className={cn("text-[12.5px]", off ? "text-warning" : "text-faint")}>Unavailable</span>
                      )}
                      {off && (
                        <button type="button" onClick={() => setDay(i, want)} className="ml-auto text-[11.5px] font-semibold text-warning hover:underline">
                          Form: {want ? want.map((r) => `${to12(r[0])} to ${to12(r[1])}`).join(", ") : "closed"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="grid gap-3.5 sm:grid-cols-2">
                {numField("slotDuration", "Slot Duration (mins)")}
                {numField("slotBuffer", "Buffer After (mins)")}
                {numField("noticeHours", "Minimum Scheduling Notice (hours)")}
                {numField("rangeDays", "Date Range (days)")}
                {numField("perDay", "Max Bookings Per Day")}
              </div>
            </div>
          </Panel>
        )}

        {section === "options" && (
          <Panel title="Additional Options">
            <div className={cn("flex items-center justify-between rounded-lg border px-4 py-3", d.autoConfirm !== wantsConfirm(d) ? "border-warning" : "border-border")}>
              <span className="text-[13px] font-semibold text-text">Auto confirm meetings</span>
              <span className="flex items-center gap-3">
                {d.autoConfirm !== wantsConfirm(d) && <Chip tone="warn">Must be {wantsConfirm(d) ? "on" : "off"}</Chip>}
                <Toggle on={d.autoConfirm} onChange={(autoConfirm) => setD((x) => ({ ...x, autoConfirm }))} label="Auto confirm meetings" />
              </span>
            </div>
          </Panel>
        )}
      </div>
    </GhlPage>
  );
}
