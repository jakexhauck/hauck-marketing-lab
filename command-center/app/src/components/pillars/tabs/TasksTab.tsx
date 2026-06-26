// Tasks tab content for a pillar. Lists the work and constraints to fix in this
// pillar as checkbox rows. Tab content only: the parent AdminPillar provides the
// page shell.

import { Check } from "lucide-react";
import type { Pillar, PillarTask } from "../../../lib/pillars";
import { NeedsSetup } from "../PillarKit";

export default function TasksTab({ pillar }: { pillar: Pillar }) {
  if (pillar.tasks.length === 0) {
    return <NeedsSetup>No tasks yet.</NeedsSetup>;
  }

  return (
    <div>
      <p className="tk-intro">Work and constraints to fix in this pillar.</p>
      <div className="pk-tasks">
        {pillar.tasks.map((task: PillarTask, i) => {
          const boxClass =
            task.status === "done" ? "pk-taskbox done" : task.status === "doing" ? "pk-taskbox doing" : "pk-taskbox";
          return (
            <div className="pk-taskrow" key={i}>
              <div className={boxClass}>{task.status === "done" && <Check />}</div>
              <div className="pk-task-main">
                <div className="pk-task-title">{task.title}</div>
                {task.note && <div className="pk-task-note">{task.note}</div>}
              </div>
              <div className="pk-task-stat">{task.status.toUpperCase()}</div>
            </div>
          );
        })}
      </div>
      <style>{`
        .tk-intro { color: var(--text-muted); font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
      `}</style>
    </div>
  );
}
