import { Check, ListChecks } from "lucide-react";
import { Card } from "./OnboardingKit";
import { checklistPhases, type ChecklistTask } from "../../../../lib/onboarding";

// The go-live checklist: nine tasks in three phases.
//
// Three of them are checked by asking GHL directly (token valid, custom values
// filled, calendars present), so they are shown as read-only rows carrying the
// live answer. Ticking those by hand would only let the board lie. The other six
// are things a person does in GHL's own UI, which nothing can verify from here,
// so they are honest manual ticks.

export interface TaskState {
  taskKey: string;
  done: boolean;
  auto: boolean;
}

export default function ChecklistCard({
  states,
  onToggle,
  readinessLoading,
}: {
  states: TaskState[];
  onToggle: (task: ChecklistTask, next: boolean) => void;
  readinessLoading: boolean;
}) {
  const doneFor = (key: string) => states.find((s) => s.taskKey === key)?.done ?? false;

  return (
    <Card
      icon={<ListChecks />}
      tone="indigo"
      title="Go-live checklist"
      note="Three phases, in the order they happen"
    >
      {checklistPhases().map((phase) => (
        <div key={phase.phase} className="onb-phase">
          <div className="onb-phase-name">{phase.phase}</div>
          {phase.tasks.map((task) => {
            const done = doneFor(task.key);
            const pending = task.auto && readinessLoading;
            return (
              <button
                key={task.key}
                type="button"
                className={`onb-task${done ? " done" : ""}${task.auto ? " auto" : ""}`}
                onClick={() => !task.auto && onToggle(task, !done)}
                aria-pressed={task.auto ? undefined : done}
                aria-disabled={task.auto || undefined}
              >
                <span className="onb-tick" aria-hidden>
                  <Check strokeWidth={3} />
                </span>
                <span className="onb-task-label">{task.label}</span>
                {task.auto && (
                  <span className="onb-badge">{pending ? "checking" : "auto"}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </Card>
  );
}
