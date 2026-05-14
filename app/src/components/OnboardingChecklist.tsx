import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ONBOARDING_PLAN,
  phaseTaskCount,
  phaseTaskIds,
  totalTasks,
  type OnboardingPhase,
  type OnboardingTask,
} from "../lib/onboardingPlan";
import { api } from "../lib/tauri";
import "./onboarding-checklist.css";

/** Legacy localStorage key — read once on first load to migrate, then cleared. */
const LEGACY_STORAGE_PREFIX = "hml-onboarding-v1:";

type Props = {
  /** Vault root; required to persist to disk. When null, state stays in-memory. */
  root: string | null;
  clientName: string;
  clientSlug: string;
  onComplete: () => void;
};

type Persisted = {
  done: string[];
  phaseDoneAt: Record<string, string>;
};

function readLegacyLocal(slug: string): Persisted | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      done: Array.isArray(parsed.done) ? parsed.done : [],
      phaseDoneAt:
        parsed.phaseDoneAt && typeof parsed.phaseDoneAt === "object"
          ? parsed.phaseDoneAt
          : {},
    };
  } catch {
    return null;
  }
}

function clearLegacyLocal(slug: string): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_PREFIX + slug);
  } catch {
    // ignore
  }
}

function formatToday(): string {
  const now = new Date();
  return now
    .toLocaleDateString(undefined, { day: "2-digit", month: "short" })
    .toUpperCase();
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Task IDs that trigger writes into the Client Dashboard (`ops/clients.json`)
 *  when first checked. Idempotent — we only write when the target column is
 *  empty, so re-checks and re-mounts don't clobber manual edits. */
const PHASE_1_TASK_IDS = ["01-contract", "01-payment", "01-welcome"];
const ADS_PUBLISH_TASK_ID = "06-publish";

export function OnboardingChecklist({ root, clientName, clientSlug, onComplete }: Props) {
  const [doneSet, setDoneSet] = useState<Set<string>>(() => new Set());
  const [phaseDoneAt, setPhaseDoneAt] = useState<Record<string, string>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Suppress the persist effect until after the load resolves, so we don't
  // race the initial empty state to disk.
  const skipNextPersist = useRef(true);
  const saveTimer = useRef<number | null>(null);

  // Load from disk (and migrate any legacy localStorage value) on mount /
  // when the client slug changes.
  useEffect(() => {
    let cancelled = false;
    skipNextPersist.current = true;
    setSelectedIndex(null);
    void (async () => {
      let next: Persisted = { done: [], phaseDoneAt: {} };
      let needsMigrationWrite = false;

      if (root) {
        try {
          const state = await api.readOnboardingState(root, clientSlug);
          next = { done: state.done ?? [], phaseDoneAt: state.phaseDoneAt ?? {} };
        } catch {
          next = { done: [], phaseDoneAt: {} };
        }
        // If vault has nothing yet, migrate from the legacy localStorage key.
        if (next.done.length === 0 && Object.keys(next.phaseDoneAt).length === 0) {
          const legacy = readLegacyLocal(clientSlug);
          if (legacy && (legacy.done.length > 0 || Object.keys(legacy.phaseDoneAt).length > 0)) {
            next = legacy;
            needsMigrationWrite = true;
          }
        }
      } else {
        // No folder selected — fall back to legacy local read so the UI works
        // standalone, but we won't write back until a root is available.
        const legacy = readLegacyLocal(clientSlug);
        if (legacy) next = legacy;
      }

      if (cancelled) return;
      setDoneSet(new Set(next.done));
      setPhaseDoneAt(next.phaseDoneAt);
      setLoaded(true);

      if (needsMigrationWrite && root) {
        try {
          await api.writeOnboardingState(root, clientSlug, {
            done: next.done,
            phaseDoneAt: next.phaseDoneAt,
          });
          clearLegacyLocal(clientSlug);
        } catch {
          // leave the legacy copy in place; we'll try again next mount
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  // Persist on every change, debounced 300ms.
  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    if (!root || !loaded) return;
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void api
        .writeOnboardingState(root, clientSlug, {
          done: Array.from(doneSet),
          phaseDoneAt,
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("onboarding persist failed", err);
        });
    }, 300);
  }, [root, clientSlug, doneSet, phaseDoneAt, loaded]);

  // Flush any pending save on unmount.
  useEffect(
    () => () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  // Auto-populate the Workspace > Clients row when onboarding milestones land.
  // Only ever writes a field that is currently empty, so manual edits in the
  // Client Dashboard always win and a re-check never clobbers them.
  useEffect(() => {
    if (!root || !loaded) return;
    const adsPublished = doneSet.has(ADS_PUBLISH_TASK_ID);
    const phase1Done = PHASE_1_TASK_IDS.every((id) => doneSet.has(id));
    if (!adsPublished && !phase1Done) return;

    let cancelled = false;
    void (async () => {
      try {
        const opsFile = await api.readOpsClients(root);
        if (cancelled) return;
        const existing = opsFile.rows[clientSlug] ?? {};
        const today = todayYMD();
        const patch: Record<string, string> = {};
        if (adsPublished && !existing.adsLaunchedAt) patch.adsLaunchedAt = today;
        if (phase1Done && !existing.startDate) patch.startDate = today;
        if (Object.keys(patch).length === 0) return;
        await api.writeOpsClients(root, {
          rows: {
            ...opsFile.rows,
            [clientSlug]: { ...existing, ...patch },
          },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("auto-populate ops row failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug, doneSet, loaded]);

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
