import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import SetterTaskModal from "./SetterTaskModal";
import { Button } from "../../ui/Button";
import { useSetterTagsMutation } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import type { StageAction, StageActionConfig } from "../../../lib/setterStageActions";

// The stage-specific cockpit body. A row of visual dial checkboxes (purely
// visual, reset per lead) over a grid of outcome buttons. Each button applies
// one CRM tag through the shared setter tags mutation; that client's GHL
// automation is what moves the lead. A button flagged promptTask opens the
// follow-up task prompt once its tag is applied.

interface Props {
  tenantId: string;
  contactId: string;
  leadName: string;
  config: StageActionConfig;
}

export default function StageActions({ tenantId, contactId, leadName, config }: Props) {
  const { showToast } = useToast();
  const tagsMutation = useSetterTagsMutation();
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);

  // Visual dial tracking. Ephemeral: reset whenever the selected lead changes,
  // so one lead's ticks never carry over to the next.
  const dialCount = config.dials ?? 0;
  const [dialed, setDialed] = useState<boolean[]>(() => Array(dialCount).fill(false));
  useEffect(() => {
    setDialed(Array(dialCount).fill(false));
  }, [contactId, dialCount]);

  const runAction = (action: StageAction) => {
    if (tagsMutation.isPending) return;
    setPendingTag(action.tag);
    tagsMutation.mutate(
      { tenantId, contactId, add: [action.tag] },
      {
        onSuccess: () => {
          setPendingTag(null);
          showToast(`${action.label} · tag applied`);
          if (action.promptTask) setTaskOpen(true);
        },
        onError: () => {
          setPendingTag(null);
          showToast("Could not apply that tag, please try again");
        },
      },
    );
  };

  return (
    <div className="flex flex-col">
      {dialCount > 0 && (
        <section className="border-b border-divider px-4 py-4">
          <h3 className="label-cap mb-2.5 text-faint">Dial attempts</h3>
          <div className="flex items-center gap-2.5">
            {dialed.map((on, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDialed((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                aria-pressed={on}
                aria-label={`Dial ${i + 1}`}
                className={
                  "grid h-10 flex-1 place-items-center rounded-[var(--radius)] border text-[13px] font-semibold transition-colors " +
                  (on
                    ? "border-brand bg-brand-tint text-brand-text"
                    : "border-border bg-surface text-muted hover:bg-surface-2")
                }
              >
                {on ? <Check size={16} /> : i + 1}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="px-4 py-4">
        <h3 className="label-cap mb-2.5 text-faint">Outcome</h3>
        <div className="grid grid-cols-2 gap-2">
          {config.actions.map((action) => (
            <Button
              key={action.tag}
              variant={action.variant ?? "secondary"}
              size="md"
              onClick={() => runAction(action)}
              loading={tagsMutation.isPending && pendingTag === action.tag}
              disabled={tagsMutation.isPending}
              className="w-full"
            >
              {action.label}
            </Button>
          ))}
        </div>
      </section>

      {taskOpen && (
        <SetterTaskModal
          tenantId={tenantId}
          contactId={contactId}
          leadName={leadName}
          onClose={() => setTaskOpen(false)}
        />
      )}
    </div>
  );
}
