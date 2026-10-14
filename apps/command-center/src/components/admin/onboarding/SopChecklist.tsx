import { useMemo, type ReactNode } from "react";
import { Check } from "lucide-react";
import type { Progress } from "../../../lib/onboardingWizard";
import { useAdminOnboardingChecklistQuery, useAdminOnboardingChecklistToggle } from "../../../hooks/useApi";
import { SOP_LISTS, sopKeys, sopTaskKey, type SopListId } from "../../../lib/sopChecklists";

// Full Setup Checklist, Onboarding Call and Launch Call: one client's ticks on
// a list from the Client Setup SOP doc (lib/sopChecklists.ts). Same look as
// the old Setup Checklist, and the same saved checklist underneath. Full Setup
// Checklist also carries that page's buttons (SetupActions) as `actions`.

export default function SopChecklist({
  tenantId,
  list,
  actions,
}: {
  tenantId: string;
  list: SopListId;
  actions?: ReactNode;
}) {
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
  if (checklist.isLoadingError) return <div className="pk-empty">Checklist did not load.</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface px-5 py-4 shadow-[var(--shadow-sm)]">
        <Ring progress={overall} size={30} />
        <h2 className="font-display text-[17px] font-semibold tracking-[-0.015em] text-text">{def.title}</h2>
        <span className="flex-1 text-[12.5px] tabular-nums text-faint">
          {overall.done}/{overall.total}
        </span>
        {actions}
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
