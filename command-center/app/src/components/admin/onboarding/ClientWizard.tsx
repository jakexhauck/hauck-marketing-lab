import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "../../ui/Button";
import { ClientSheet } from "./OnboardingSheet";
import SoftwareDialog from "./SoftwareDialog";
import {
  useAdminOnboardingChecklistQuery,
  useAdminOnboardingChecklistToggle,
  useAdminOnboardingChecklistValue,
  useAdminOnboardingDriveFolder,
  useAdminOnboardingGoLive,
  useAdminOnboardingQuery,
} from "../../../hooks/useApi";
import type { AdminOnboardingListItem } from "../../../lib/api";
import {
  SETUP_SECTIONS,
  SOFTWARE_LIVE_CODE,
  groupSteps,
  type SetupSection,
  type SetupStepRow,
} from "../../../lib/setupSteps";
import { bundleLabel, dialerLabel, pillarProgress, type Progress } from "../../../lib/onboardingWizard";

// One client's onboarding, in either view.
//
// Stepper walks the pillars one at a time with Back and Next; Scroll lays them
// all out, finished ones folded shut. Same data, same controls: the view is
// only how much of it is on screen at once.
//
// The header carries Software setup (a pop-up, SoftwareDialog), Create client
// folder (clientDriveFolder.ts) and Go live.
// Go live is never locked (Jake, 2026-08-15): the judgement of when a client is
// ready is his, not a count's. Under the header, the client's form answers sit
// folded into one line until opened.

export type WizardView = "stepper" | "scroll";

type Pillar = { id: SetupSection; label: string };
const PILLARS: Pillar[] = SETUP_SECTIONS;

export default function ClientWizard({
  client,
  subtitle,
  steps,
  view,
}: {
  client: AdminOnboardingListItem;
  subtitle: string;
  steps: SetupStepRow[];
  view: WizardView;
}) {
  const checklist = useAdminOnboardingChecklistQuery(client.id);
  const toggle = useAdminOnboardingChecklistToggle(client.id);
  const saveValue = useAdminOnboardingChecklistValue(client.id);
  const goLive = useAdminOnboardingGoLive(client.id);
  const [software, setSoftware] = useState(false);
  const openSoftware = () => setSoftware(true);

  const { doneIds, values } = useMemo(() => {
    const items = checklist.data?.items ?? [];
    return {
      doneIds: new Set(items.filter((i) => i.done).map((i) => i.task_key)),
      values: new Map(items.map((i) => [i.task_key, i.value ?? ""])),
    };
  }, [checklist.data]);

  const progressOf = (id: Pillar["id"]): Progress => pillarProgress(steps, id, doneIds);

  const body = (id: Pillar["id"]) => (
      <PillarBody
        steps={steps}
        section={id}
        doneIds={doneIds}
        values={values}
        loading={checklist.isLoading}
        onToggle={(taskKey, done) => toggle.mutate({ taskKey, done })}
        onValue={(taskKey, value) => saveValue.mutate({ taskKey, value })}
        onSoftware={openSoftware}
      />
    );

  const header = (
    <>
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] font-display text-[12px] font-bold text-white"
        style={{ background: client.brandColor || "var(--brand)" }}
        aria-hidden
      >
        {client.brandInitials || client.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-[17px] font-semibold tracking-[-0.015em] text-text">
          {client.name}
        </h2>
        {subtitle && <p className="truncate text-[12.5px] text-faint">{subtitle}</p>}
      </div>
      <SoftwareButton client={client} onOpen={openSoftware} />
      <FolderButton client={client} />
      {goLive.isError && (
        <span className="text-[12px] font-medium text-danger">
          {(goLive.error as Error)?.message ?? "That did not work."}
        </span>
      )}
      <Button size="sm" variant="primary" loading={goLive.isPending} onClick={() => goLive.mutate()}>
        Go live
      </Button>
    </div>
    <FormAnswers tenantId={client.id} />
    </>
  );

  return (
    <>
      {view === "stepper" ? (
        <StepperView header={header} progressOf={progressOf} body={body} />
      ) : (
        <ScrollView header={header} progressOf={progressOf} body={body} />
      )}
      {software && <SoftwareDialog client={client} onClose={() => setSoftware(false)} />}
    </>
  );
}

// Grey until submitted, then grey with a green ticked box: done, and still
// clickable to change an answer.
function SoftwareButton({
  client,
  onOpen,
}: {
  client: AdminOnboardingListItem;
  onOpen: () => void;
}) {
  if (!client.softwareLiveAt) {
    return (
      <Button variant="secondary" size="sm" onClick={onOpen}>
        Software setup
      </Button>
    );
  }
  const since = new Date(client.softwareLiveAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Live since ${since}: ${bundleLabel(client.bundle)}, ${dialerLabel(client.dialer)}`}
      aria-label={`Software setup, live since ${since}. Open to change.`}
      className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 text-[13px] font-medium text-faint transition-colors hover:text-muted"
    >
      <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-positive text-white">
        <Check size={11} strokeWidth={3.2} aria-hidden />
      </span>
      Software setup
    </button>
  );
}

// Same two looks as SoftwareButton. Once the folder exists the button opens it;
// a doc that failed to copy is named beside it until the page reloads.
function FolderButton({ client }: { client: AdminOnboardingListItem }) {
  const create = useAdminOnboardingDriveFolder(client.id);
  const problem = create.isError
    ? ((create.error as Error)?.message ?? "That did not work.")
    : create.data?.warning;

  return (
    <>
      {problem && <span className="text-[12px] font-medium text-danger">{problem}</span>}
      {client.driveFolderUrl ? (
        <a
          href={client.driveFolderUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Client folder, created. Open in Google Drive."
          className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 text-[13px] font-medium text-faint transition-colors hover:text-muted"
        >
          <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-positive text-white">
            <Check size={11} strokeWidth={3.2} aria-hidden />
          </span>
          Client folder
        </a>
      ) : (
        <Button variant="secondary" size="sm" loading={create.isPending} onClick={() => create.mutate()}>
          Create client folder
        </Button>
      )}
    </>
  );
}

// The client's form answers, folded to one line (who, phone, email) until
// opened. Open, it is the full copyable sheet with the sub-account card.
function FormAnswers({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const record = useAdminOnboardingQuery(tenantId);
  const intake = record.data?.intake ?? {};
  const summary = [intake.contactName, intake.contactPhone, intake.contactEmail]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="border-t border-divider">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <span className="label-cap shrink-0">Form answers</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{summary}</span>
        <ChevronDown
          size={16}
          aria-hidden
          className={"shrink-0 text-faint transition-transform " + (open ? "rotate-180" : "")}
        />
      </button>
      {open && <ClientSheet tenantId={tenantId} />}
    </div>
  );
}

// ---------- Stepper ----------

function StepperView({
  header,
  progressOf,
  body,
}: {
  header: ReactNode;
  progressOf: (id: Pillar["id"]) => Progress;
  body: (id: Pillar["id"]) => ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const pillar = PILLARS[index];
  const last = index === PILLARS.length - 1;

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      {header}
      <nav aria-label="Steps" className="flex gap-1 overflow-x-auto border-y border-divider p-1.5">
        {PILLARS.map((p, i) => {
          const pr = progressOf(p.id);
          const complete = pr.total > 0 && pr.done === pr.total;
          const on = i === index;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={on ? "step" : undefined}
              className={
                "min-w-[118px] flex-1 rounded-[var(--radius)] px-3 py-2.5 text-left transition-colors " +
                (on ? "bg-surface-3" : "hover:bg-surface-2")
              }
            >
              <span
                className={
                  "flex items-center gap-1.5 text-[11.5px] tabular-nums " +
                  (complete ? "text-brand-text" : "text-faint")
                }
              >
                <span
                  className={
                    "grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-bold " +
                    (complete ? "bg-brand text-brand-fg" : "bg-surface-3 text-muted") +
                    (on ? " ring-[1.5px] ring-brand" : "")
                  }
                >
                  {complete ? <Check size={11} strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                {pr.done}/{pr.total}
              </span>
              <span className="mt-0.5 block whitespace-nowrap text-[13.5px] font-semibold text-text">
                {p.label}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="min-h-[360px] px-3 py-4 sm:px-4">{body(pillar.id)}</div>
      <div className="flex items-center justify-between border-t border-divider px-5 py-3">
        <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Back
        </Button>
        {!last && (
          <Button variant="primary" size="sm" onClick={() => setIndex(index + 1)}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- Scroll ----------

function ScrollView({
  header,
  progressOf,
  body,
}: {
  header: ReactNode;
  progressOf: (id: Pillar["id"]) => Progress;
  body: (id: Pillar["id"]) => ReactNode;
}) {
  // Null until touched: until then a pillar is open exactly while unfinished,
  // so finishing one folds it away. Once Jake opens or closes one by hand, his
  // choice holds for every pillar.
  const [open, setOpen] = useState<Record<string, boolean> | null>(null);
  const isOpen = (id: string) => {
    if (open) return open[id];
    const pr = progressOf(id as Pillar["id"]);
    return !(pr.total > 0 && pr.done === pr.total);
  };
  const flip = (id: string) => {
    const base = open ?? Object.fromEntries(PILLARS.map((p) => [p.id, isOpen(p.id)]));
    setOpen({ ...base, [id]: !base[id] });
  };
  const jump = (id: string) => {
    if (!isOpen(id)) flip(id);
    requestAnimationFrame(() =>
      document.getElementById(`pillar-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
        {header}
      </div>
      <nav
        aria-label="Pillars"
        className="sticky top-2 z-10 flex gap-1 overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface p-1.5 shadow-[var(--shadow-sm)]"
      >
        {PILLARS.map((p) => {
          const pr = progressOf(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => jump(p.id)}
              className="flex shrink-0 items-center gap-2 rounded-[var(--radius)] px-2.5 py-1.5 text-[13px] font-medium text-text hover:bg-surface-2"
            >
              <Ring progress={pr} size={20} />
              {p.label}
            </button>
          );
        })}
      </nav>
      {PILLARS.map((p) => {
        const pr = progressOf(p.id);
        const shown = isOpen(p.id);
        return (
          <section
            key={p.id}
            id={`pillar-${p.id}`}
            className="scroll-mt-20 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]"
          >
            <button
              type="button"
              onClick={() => flip(p.id)}
              aria-expanded={shown}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2/50"
            >
              <Ring progress={pr} size={24} />
              <h3 className="flex-1 font-display text-[15px] font-semibold text-text">{p.label}</h3>
              <span className="text-[12px] tabular-nums text-faint">
                {pr.done}/{pr.total}
              </span>
              <ChevronDown
                size={16}
                aria-hidden
                className={"text-faint transition-transform " + (shown ? "" : "-rotate-90")}
              />
            </button>
            {shown && <div className="px-2 pb-3 sm:px-3">{body(p.id)}</div>}
          </section>
        );
      })}
    </div>
  );
}

function Ring({ progress, size }: { progress: Progress; size: number }) {
  const frac = progress.total ? progress.done / progress.total : 0;
  const r = 10;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden className="shrink-0">
      <circle cx="13" cy="13" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="3" />
      <circle
        cx="13"
        cy="13"
        r={r}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform="rotate(-90 13 13)"
        style={{ transition: "stroke-dashoffset .3s ease" }}
      />
      {frac === 1 && (
        <path
          d="M9 13.2l2.6 2.6L17 10.4"
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

// ---------- Bodies ----------

function PillarBody({
  steps,
  section,
  doneIds,
  values,
  loading,
  onToggle,
  onValue,
  onSoftware,
}: {
  steps: SetupStepRow[];
  section: SetupSection;
  doneIds: Set<string>;
  values: Map<string, string>;
  loading: boolean;
  onToggle: (taskKey: string, done: boolean) => void;
  onValue: (taskKey: string, value: string) => void;
  onSoftware: () => void;
}) {
  const groups = useMemo(() => groupSteps(steps, section), [steps, section]);
  if (loading) return <p className="px-3 py-2 text-[13px] text-muted">Loading...</p>;
  if (groups.length === 0) return <p className="px-3 py-2 text-[13px] text-muted">No steps.</p>;

  return (
    <div className="flex flex-col">
      {groups.map((g, gi) => (
        <div key={`${g.label ?? "none"}-${gi}`}>
          {g.label && <p className="label-cap px-3 pb-1 pt-3">{g.label}</p>}
          {g.steps.map((s) => (
            <ChecklistItem
              key={s.id}
              step={s}
              done={doneIds.has(s.id)}
              value={values.get(s.id) ?? ""}
              onToggle={() => onToggle(s.id, !doneIds.has(s.id))}
              onValue={(v) => onValue(s.id, v)}
              onSoftware={s.code === SOFTWARE_LIVE_CODE ? onSoftware : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ChecklistItem({
  step,
  done,
  value,
  onToggle,
  onValue,
  onSoftware,
}: {
  step: SetupStepRow;
  done: boolean;
  value: string;
  onToggle: () => void;
  onValue: (v: string) => void;
  /** Only on Software Account Made: opens Software setup. */
  onSoftware?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  // A fresh value from the server (another tab, a refetch) replaces the draft,
  // but never while it is the thing being typed over.
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }

  return (
    <div className="flex items-start gap-3 rounded-[var(--radius)] px-3 py-2.5 transition-colors hover:bg-surface-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={step.label}
        onClick={onToggle}
        className={
          "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-[1.5px] transition-colors " +
          (done ? "border-brand bg-brand text-brand-fg" : "border-border-strong bg-surface hover:border-brand")
        }
      >
        {done && <Check size={13} strokeWidth={3} aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggle}
          className={
            "text-left text-[14px] font-medium transition-colors " +
            (done ? "text-faint line-through decoration-faint" : "text-text")
          }
        >
          {step.label}
        </button>
        {step.note && <p className="mt-0.5 text-[12.5px] text-muted">{step.note}</p>}
        {step.fieldLabel && (
          <input
            value={draft}
            placeholder={step.fieldLabel}
            aria-label={step.fieldLabel}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft.trim() !== value.trim()) onValue(draft);
            }}
            className="mt-2 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1.5 text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
        )}
      </div>
      {onSoftware && (
        <button
          type="button"
          onClick={onSoftware}
          className="shrink-0 self-center text-[12.5px] font-medium text-brand-text hover:underline"
        >
          Software setup
        </button>
      )}
    </div>
  );
}
