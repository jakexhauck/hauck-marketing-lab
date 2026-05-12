import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ONBOARDING_PLAN,
  phaseTaskCount,
  phaseTaskIds,
  totalTasks,
  type OnboardingPhase,
  type OnboardingTask,
} from "../lib/onboardingPlan";
import "./onboarding-checklist.css";

const STORAGE_PREFIX = "hml-onboarding-v1:";

type Props = {
  clientName: string;
  clientSlug: string;
  onComplete: () => void;
};

function storageKey(slug: string): string {
  return STORAGE_PREFIX + slug;
}

type Persisted = {
  done: string[];
  phaseDoneAt: Record<string, string>;
};

function loadState(slug: string): Persisted {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return { done: [], phaseDoneAt: {} };
    const parsed = JSON.parse(raw);
    return {
      done: Array.isArray(parsed.done) ? parsed.done : [],
      phaseDoneAt: parsed.phaseDoneAt && typeof parsed.phaseDoneAt === "object" ? parsed.phaseDoneAt : {},
    };
  } catch {
    return { done: [], phaseDoneAt: {} };
  }
}

function saveState(slug: string, state: Persisted): void {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(state));
  } catch {
    // localStorage may be unavailable; silently fall back to in-memory only.
  }
}

function formatToday(): string {
  const now = new Date();
  return now
    .toLocaleDateString(undefined, { day: "2-digit", month: "short" })
    .toUpperCase();
}

export function OnboardingChecklist({ clientName, clientSlug, onComplete }: Props) {
  const [doneSet, setDoneSet] = useState<Set<string>>(() => new Set(loadState(clientSlug).done));
  const [phaseDoneAt, setPhaseDoneAt] = useState<Record<string, string>>(
    () => loadState(clientSlug).phaseDoneAt,
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Reload state when switching clients.
  useEffect(() => {
    const next = loadState(clientSlug);
    setDoneSet(new Set(next.done));
    setPhaseDoneAt(next.phaseDoneAt);
    setSelectedIndex(null);
  }, [clientSlug]);

  // Persist on every change.
  useEffect(() => {
    saveState(clientSlug, { done: Array.from(doneSet), phaseDoneAt });
  }, [clientSlug, doneSet, phaseDoneAt]);

  const total = useMemo(() => totalTasks(), []);
  const doneCount = doneSet.size;

  // Derive each phase's state from the task set, and stamp phaseDoneAt when a
  // phase completes for the first time.
  const phaseStates = useMemo(() => {
    return ONBOARDING_PLAN.map((p) => {
      const ids = phaseTaskIds(p);
      const completed = ids.filter((id) => doneSet.has(id)).length;
      return { phase: p, completed, total: ids.length };
    });
  }, [doneSet]);

  // Auto-derived active phase = first non-complete phase. Drives the progress
  // strip "Phase N / M" indicator regardless of which phase the user is viewing.
  const activeIndex = phaseStates.findIndex((s) => s.completed < s.total);

  // The phase shown expanded. User-selected phase wins; otherwise fall back to
  // the auto-derived active phase. -1 means no phase is expanded (all done and
  // nothing manually selected).
  const expandedIndex =
    selectedIndex !== null && selectedIndex >= 0 && selectedIndex < phaseStates.length
      ? selectedIndex
      : activeIndex;

  useEffect(() => {
    setPhaseDoneAt((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of phaseStates) {
        const key = String(s.phase.num);
        if (s.completed === s.total && !next[key]) {
          next[key] = formatToday();
          changed = true;
        } else if (s.completed < s.total && next[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [phaseStates]);

  const toggleTask = useCallback((id: string) => {
    setDoneSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const fillPct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;
  const currentPhaseNum = activeIndex === -1 ? ONBOARDING_PLAN.length : ONBOARDING_PLAN[activeIndex].num;

  return (
    <div className="ob-root">
      <div className="ob-progress-strip">
        <div className="ob-progress-inner">
          <span className="ob-progress-label">▸ Onboarding</span>
          <span className="ob-progress-count">
            <em>{doneCount}</em> of {total} tasks
          </span>
          <div className="ob-progress-bar">
            <div className="ob-fill" style={{ width: `${fillPct}%` }} />
            {Array.from({ length: ONBOARDING_PLAN.length - 1 }, (_, i) => (
              <span
                key={i}
                className="ob-marker"
                style={{ left: `${((i + 1) * 100) / ONBOARDING_PLAN.length}%` }}
              />
            ))}
          </div>
          <span className="ob-progress-count">
            Phase <em>{Math.min(currentPhaseNum, ONBOARDING_PLAN.length - 1)}</em> / {ONBOARDING_PLAN.length}
          </span>
        </div>
      </div>

      <main className="ob-stack">
        {phaseStates.map((s, i) => {
          const isDone = s.completed === s.total;
          const isActive = i === expandedIndex;
          if (isActive) {
            return (
              <ActiveCard
                key={s.phase.num}
                phase={s.phase}
                doneSet={doneSet}
                completed={s.completed}
                onToggle={toggleTask}
              />
            );
          }
          if (isDone) {
            return (
              <DoneCard
                key={s.phase.num}
                phase={s.phase}
                completedAt={phaseDoneAt[String(s.phase.num)]}
                onSelect={() => setSelectedIndex(i)}
              />
            );
          }
          return (
            <UpcomingCard
              key={s.phase.num}
              phase={s.phase}
              onSelect={() => setSelectedIndex(i)}
            />
          );
        })}
      </main>

      {allDone && (
        <div className="ob-graduate">
          <button type="button" onClick={onComplete}>
            ▸ Onboarding complete · open client dashboard →
          </button>
        </div>
      )}

      <div className="ob-foot">
        <span className="ob-line" />
        <span>
          {clientName} · {ONBOARDING_PLAN.length} phases · {total} tasks
        </span>
        <span className="ob-line" />
      </div>

      {!allDone && (
        <div className="ob-graduate">
          <button type="button" onClick={onComplete}>
            Skip to client dashboard →
          </button>
        </div>
      )}
    </div>
  );
}

function DoneCard({
  phase,
  completedAt,
  onSelect,
}: {
  phase: OnboardingPhase;
  completedAt: string | undefined;
  onSelect: () => void;
}) {
  const total = phaseTaskCount(phase);
  return (
    <button
      type="button"
      className="ob-card ob-done"
      onClick={onSelect}
      aria-label={`Open phase ${phase.num}: ${phase.name}`}
    >
      <div className="ob-check">✓</div>
      <div className="ob-phase-num">PHASE {String(phase.num).padStart(2, "0")}</div>
      <div className="ob-phase-name">{phase.name}</div>
      <div className="ob-done-meta">
        {total} OF {total} COMPLETE
        {completedAt && (
          <>
            <span className="ob-sep">·</span>
            {completedAt}
          </>
        )}
      </div>
    </button>
  );
}

function UpcomingCard({ phase, onSelect }: { phase: OnboardingPhase; onSelect: () => void }) {
  return (
    <button
      type="button"
      className="ob-card ob-upcoming"
      onClick={onSelect}
      aria-label={`Open phase ${phase.num}: ${phase.name}`}
    >
      <div className="ob-upcoming-ring">{String(phase.num).padStart(2, "0")}</div>
      <div className="ob-upcoming-body">
        <div className="ob-upcoming-head">
          <span className="ob-upcoming-num">PHASE {String(phase.num).padStart(2, "0")}</span>
          <span className="ob-upcoming-name">{phase.name}</span>
        </div>
        <div className="ob-upcoming-hint">{phase.hint}</div>
      </div>
      <div className="ob-upcoming-meta">{phase.meta}</div>
    </button>
  );
}

function ActiveCard({
  phase,
  doneSet,
  completed,
  onToggle,
}: {
  phase: OnboardingPhase;
  doneSet: Set<string>;
  completed: number;
  onToggle: (id: string) => void;
}) {
  const total = phaseTaskCount(phase);
  return (
    <section className="ob-card ob-active">
      <div className="ob-active-head">
        <div className="ob-active-num">
          PHASE {String(phase.num).padStart(2, "0")} / {ONBOARDING_PLAN.length}
        </div>
        <div className="ob-active-title">
          <h2>
            <span dangerouslySetInnerHTML={{ __html: phase.name }} />
          </h2>
          <p className="ob-purpose">{phase.purpose}</p>
        </div>
        <div className="ob-active-stats">
          <div className="ob-pill">▸ ACTIVE</div>
          <div className="ob-count-ring">
            <em>{completed}</em> / {total} tasks
          </div>
        </div>
      </div>

      <div className="ob-active-body">
        {phase.subsections.map((ss) => {
          const ssDone = ss.tasks.filter((t) => doneSet.has(t.id)).length;
          return (
            <div className="ob-subsection" key={ss.id}>
              <div className="ob-sub-head">
                <span className="ob-sub-label">
                  <span className="ob-num">{ss.id}</span>
                  {ss.title}
                </span>
                <span className="ob-sub-meta">
                  {ss.meta ? `${ss.meta} · ` : ""}
                  {ssDone} / {ss.tasks.length}
                </span>
              </div>
              {ss.tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  checked={doneSet.has(t.id)}
                  onToggle={() => onToggle(t.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TaskRow({
  task,
  checked,
  onToggle,
}: {
  task: OnboardingTask;
  checked: boolean;
  onToggle: () => void;
}) {
  const howto = task.howto;
  return (
    <div className={"ob-task" + (checked ? " ob-complete" : "")}>
      <button
        type="button"
        className={"ob-check-box" + (checked ? " ob-checked" : "")}
        onClick={onToggle}
        aria-label={checked ? "Mark task incomplete" : "Mark task complete"}
      />
      <div className="ob-task-body">
        <span dangerouslySetInnerHTML={{ __html: task.label }} />
        {howto && (
          <div className="ob-task-howto">
            <span className="ob-howto-label">▸ How to</span>
            {typeof howto === "string" ? (
              <span dangerouslySetInnerHTML={{ __html: howto }} />
            ) : (
              <ol>
                {howto.map((step, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: step }} />
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
