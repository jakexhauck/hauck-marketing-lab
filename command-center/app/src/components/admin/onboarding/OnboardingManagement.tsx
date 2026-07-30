import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { Button } from "../../ui/Button";
import {
  useArchiveSetupStep,
  useCreateSetupStep,
  useSetupSteps,
  useUpdateSetupStep,
} from "../../../hooks/useSetupSteps";
import {
  SETUP_SECTIONS,
  groupSteps,
  isSetupSection,
  moveStep,
  nextPosition,
  type SetupSection,
  type SetupStepRow,
} from "../../../lib/setupSteps";

// Onboarding > Management: the owner editing the process itself.
//
// Same shape as Cold Call > Management: a second level of tabs under the view,
// in ?manage=, so a link to a specific page survives a reload.
//
// Everything here changes what every client's Client setup page shows. It edits
// the process, never one client's progress: a tick belongs to a client, a step
// belongs to the agency.

export default function OnboardingManagement() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("manage");
  const section: SetupSection = isSetupSection(raw) ? raw : "ghl";

  const setSection = (next: SetupSection) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("manage", next);
        return p;
      },
      { replace: true },
    );
  };

  const steps = useSetupSteps();

  return (
    <div className="flex w-full max-w-[900px] flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Management pages">
        {SETUP_SECTIONS.map((s) => {
          const on = s.id === section;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSection(s.id)}
              className={[
                "rounded-[var(--radius)] border px-3.5 py-2 text-[13px] font-semibold transition-colors",
                on
                  ? "border-brand bg-brand-tint text-brand-text"
                  : "border-border bg-surface text-muted hover:text-text",
              ].join(" ")}
            >
              {s.label} steps
            </button>
          );
        })}
      </div>

      {steps.data?.needsMigration ? (
        <section className="rounded-[var(--radius-lg)] border border-danger/40 bg-danger/5 p-5">
          <p className="text-[13.5px] font-semibold text-text">
            The steps table does not exist yet.
          </p>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            Run <code className="font-mono text-[12px]">0072_setup_steps.sql</code> and this page
            fills in with the process, ready to edit.
          </p>
        </section>
      ) : steps.isLoading ? (
        <p className="px-1 text-[13px] text-muted">Loading the steps...</p>
      ) : (
        <SectionEditor section={section} steps={steps.data?.steps ?? []} />
      )}
    </div>
  );
}

function SectionEditor({
  section,
  steps,
}: {
  section: SetupSection;
  steps: SetupStepRow[];
}) {
  const create = useCreateSetupStep();
  const update = useUpdateSetupStep();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);

  const groups = useMemo(() => groupSteps(steps, section), [steps, section]);

  // The section as one flat ordered list, which is what a move is expressed
  // against: dropping a step under a different heading is a move to that
  // position, and it inherits the heading it lands under.
  const ordered = useMemo(() => groups.flatMap((g) => g.steps), [groups]);

  const commitMove = (fromId: string, toId: string) => {
    const from = ordered.findIndex((s) => s.id === fromId);
    const to = ordered.findIndex((s) => s.id === toId);
    if (from < 0 || to < 0 || from === to) return;

    const writes = moveStep(ordered, from, to);
    // The heading is part of where a step sits, so a step dropped into another
    // day belongs to that day. Without this it would render under the previous
    // heading while sitting in the middle of the next one.
    const landedUnder = ordered[to].groupLabel ?? "";
    for (const write of writes) {
      update.mutate({
        id: write.id,
        position: write.position,
        ...(write.id === fromId ? { groupLabel: landedUnder } : {}),
      });
    }
  };
  const def = SETUP_SECTIONS.find((s) => s.id === section)!;

  // The headings already in use, offered as suggestions. Typed, not chosen from
  // a fixed list: adding "Day 8" should be an afternoon, not a migration.
  const knownGroups = useMemo(
    () => [...new Set(groups.map((g) => g.label).filter((l): l is string => Boolean(l)))],
    [groups],
  );

  const submit = () => {
    const clean = label.trim();
    if (!clean) return;
    create.mutate(
      {
        section,
        label: clean,
        groupLabel: group.trim() || undefined,
        position: nextPosition(steps, section),
      },
      {
        onSuccess: () => {
          setLabel("");
          setAdding(false);
        },
      },
    );
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[16.5px] font-semibold text-text">{def.label} steps</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            What every client's {def.label} section asks you to do.
          </p>
        </div>
        {!adding && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden />
            Add a step
          </Button>
        )}
      </header>

      {adding && (
        <div className="mb-4 rounded-[var(--radius)] border border-border bg-surface-2 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
            <div>
              <label htmlFor="new-step" className="label-cap block">
                Step
              </label>
              <input
                id="new-step"
                autoFocus
                value={label}
                placeholder="Publish the workflows, activate the triggers"
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>
            <div>
              <label htmlFor="new-group" className="label-cap block">
                Under (optional)
              </label>
              <input
                id="new-group"
                list="known-groups"
                value={group}
                placeholder="Day 2, research and setup"
                onChange={(e) => setGroup(e.target.value)}
                className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
              <datalist id="known-groups">
                {knownGroups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button variant="primary" size="sm" loading={create.isPending} onClick={submit}>
              Add step
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            {create.isError && (
              <span className="text-[12px] font-medium text-danger">
                {(create.error as Error)?.message ?? "That did not save."}
              </span>
            )}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-[13px] text-muted">No steps yet. Add the first one.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g, i) => (
            <div key={`${g.label ?? "none"}-${i}`}>
              {g.label && <p className="label-cap mb-2">{g.label}</p>}
              <ul className="flex flex-col gap-1.5">
                {g.steps.map((step) => (
                  <li
                    key={step.id}
                    onDragOver={(e) => {
                      if (!dragging || dragging === step.id) return;
                      // Without this the drop is refused and nothing moves.
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragging) commitMove(dragging, step.id);
                      setDragging(null);
                    }}
                    className={dragging === step.id ? "opacity-40" : undefined}
                  >
                    <EditableStep
                      step={step}
                      dragging={dragging === step.id}
                      onDragStart={() => setDragging(step.id)}
                      onDragEnd={() => setDragging(null)}
                      onNudge={(dir) => {
                        const i = ordered.findIndex((s) => s.id === step.id);
                        const target = ordered[i + dir];
                        if (target) commitMove(step.id, target.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// One step, edited in place.
//
// The label saves on blur rather than behind a Save button: this is a list of
// short strings being corrected, and a button per row would be forty buttons.
function EditableStep({
  step,
  dragging,
  onDragStart,
  onDragEnd,
  onNudge,
}: {
  step: SetupStepRow;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  /** -1 up, +1 down. The keyboard's way to do what dragging does. */
  onNudge: (direction: -1 | 1) => void;
}) {
  const update = useUpdateSetupStep();
  const archive = useArchiveSetupStep();

  const [label, setLabel] = useState(step.label);
  const [note, setNote] = useState(step.note ?? "");
  const [confirming, setConfirming] = useState(false);
  const [openNote, setOpenNote] = useState(false);

  const commit = (patch: Partial<{ label: string; note: string; required: boolean }>) => {
    update.mutate({ id: step.id, ...patch });
  };

  return (
    <div
      // Dragging is started from the handle, not the row, so selecting the text
      // of a label does not turn into a drag.
      draggable={dragging}
      onDragEnd={onDragEnd}
      className={`rounded-[var(--radius)] border bg-surface px-3 py-2.5 ${
        dragging ? "border-brand" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label={`Move ${step.label}. Use the arrow keys, or drag.`}
          onMouseDown={onDragStart}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onNudge(-1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onNudge(1);
            }
          }}
          className="shrink-0 cursor-grab rounded p-0.5 text-faint hover:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand active:cursor-grabbing"
        >
          <GripVertical size={15} aria-hidden />
        </button>

        <input
          value={label}
          aria-label="Step"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const clean = label.trim();
            if (!clean) {
              setLabel(step.label);
              return;
            }
            if (clean !== step.label) commit({ label: clean });
          }}
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1.5 py-1 text-[13.5px] text-text hover:border-border focus:border-brand focus:bg-surface focus:outline-none"
        />

        {step.code ? (
          // An auto step's wiring is its code, so it can be renamed but not
          // made optional: the live check ticks it either way.
          <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-text">
            Auto
          </span>
        ) : (
          <button
            type="button"
            onClick={() => commit({ required: !step.required })}
            className={[
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
              step.required
                ? "bg-surface-3 text-muted hover:text-text"
                : "bg-transparent text-faint hover:text-muted",
            ].join(" ")}
            title={
              step.required
                ? "Required before Go Live. Click to make optional."
                : "Optional. Click to make it required."
            }
          >
            {step.required ? "Required" : "Optional"}
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpenNote((o) => !o)}
          className="shrink-0 text-[11.5px] font-medium text-muted hover:text-brand-text"
        >
          {step.note || openNote ? "Note" : "Add note"}
        </button>

        {confirming ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => archive.mutate(step.id)}
              className="text-[11.5px] font-semibold text-danger hover:underline"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              aria-label="Cancel"
              className="text-faint hover:text-muted"
            >
              <X size={13} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${step.label}`}
            className="shrink-0 rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {(openNote || step.note) && (
        <input
          value={note}
          aria-label="Note"
          placeholder="One line of detail, where the step name is not enough."
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note.trim() !== (step.note ?? "")) commit({ note: note.trim() });
          }}
          className="mt-1.5 ml-[26px] w-[calc(100%-26px)] rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] text-muted placeholder:text-faint hover:border-border focus:border-brand focus:bg-surface focus:outline-none"
        />
      )}
    </div>
  );
}
