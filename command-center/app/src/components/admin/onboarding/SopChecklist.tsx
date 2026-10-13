import { useMemo } from "react";
import { Check } from "lucide-react";
import { Ring } from "./ClientWizard";
import { useAdminOnboardingChecklistQuery, useAdminOnboardingChecklistToggle } from "../../../hooks/useApi";
import { SOP_LISTS, sopKeys, sopTaskKey, type SopListId } from "../../../lib/sopChecklists";

// Full Setup Checklist, Onboarding Call and Launch Call: one client's ticks on
// a list from the Client Setup SOP doc (lib/sopChecklists.ts). Same look as
// Setup Checklist, and the same saved checklist underneath.

export default function SopChecklist({ tenantId, list }: { tenantId: string; list: SopListId }) {
  const def = SOP_LISTS[list];
  const checklist = useAdminOnboardingChecklistQuery(tenantId);
  const toggle = useAdminOnboardingChecklistToggle(tenantId);

  const done = useMemo(
    () => new Set((checklist.data?.items ?? []).filter((i) => i.done).map((i) => i.task_key)),
    [checklist.data],
  );
  const count = (keys: string[]) => ({ done: keys.filter((k) => done.has(k)).length, total: keys.length });
  const overall = count(sopKeys(def));

  if (checklist.isLoading) return <div className="pk-empty">Loading...</div>;
  if (checklist.isError) return <div className="pk-empty">Checklist did not load.</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface px-5 py-4 shadow-[var(--shadow-sm)]">
        <Ring progress={overall} size={30} />
        <h2 className="flex-1 font-display text-[17px] font-semibold tracking-[-0.015em] text-text">{def.title}</h2>
        <span className="text-[12.5px] tabular-nums text-faint">
          {overall.done}/{overall.total}
        </span>
      </div>

      {def.sections.map((s) => {
        const pr = count(sopKeys(def, s));
        return (
          <section
            key={s.title}
            className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-center gap-3 px-4 pt-3.5">
              <Ring progress={pr} size={24} />
              <h3 className="flex-1 font-display text-[15px] font-semibold text-text">{s.title}</h3>
              <span className="text-[12px] tabular-nums text-faint">
                {pr.done}/{pr.total}
              </span>
            </div>
            <div className="px-2 pb-3 sm:px-3">
              {s.groups.map((g, gi) => (
                <div key={`${g.label ?? "none"}-${gi}`}>
                  {g.label && <p className="label-cap px-3 pb-1 pt-3">{g.label}</p>}
                  {g.items.map((item) => {
                    const key = sopTaskKey(list, s.title, item.label);
                    const isDone = done.has(key);
                    const flip = () => toggle.mutate({ taskKey: key, done: !isDone });
                    return (
                      <div
                        key={key}
                        className="flex items-start gap-3 rounded-[var(--radius)] px-3 py-2.5 transition-colors hover:bg-surface-2"
                      >
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isDone}
                          aria-label={item.label}
                          onClick={flip}
                          className={
                            "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-[1.5px] transition-colors " +
                            (isDone
                              ? "border-brand bg-brand text-brand-fg"
                              : "border-border-strong bg-surface hover:border-brand")
                          }
                        >
                          {isDone && <Check size={13} strokeWidth={3} aria-hidden />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={flip}
                            className={
                              "text-left text-[14px] font-medium transition-colors " +
                              (isDone ? "text-faint line-through decoration-faint" : "text-text")
                            }
                          >
                            {item.label}
                          </button>
                          {item.note && <p className="mt-0.5 text-[12.5px] text-muted">{item.note}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
