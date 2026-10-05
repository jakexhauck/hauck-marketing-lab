import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { subtitle } from "./AccountRow";
import ClientWizard, { type WizardView } from "./ClientWizard";
import DeleteDialog from "./DeleteDialog";
import { Segmented } from "../../ui/Segmented";
import { useAdminOnboardingListQuery, useAdminOnboardingRemove } from "../../../hooks/useApi";
import { useSetupSteps } from "../../../hooks/useSetupSteps";

// One client's Onboarding, inside their sub-account
// (/admin/client/:tenantId/onboarding).
//
// The checklist that used to sit on the right of the Onboarding roster, now on
// its own: the client is already chosen by the strip, so the roster went. The
// Stepper / Scroll choice is the same remembered one the roster page used.
//
// Delete is the roster's old X: the onboarding record is wiped and the client
// marked 'removed' (account untouched, see remove.ts). It sends you back to the
// agency, because the sub-account you were standing in is no longer listed.

const VIEW_KEY = "onboarding-view";

function savedView(): WizardView {
  try {
    return localStorage.getItem(VIEW_KEY) === "scroll" ? "scroll" : "stepper";
  } catch {
    return "stepper";
  }
}

export default function ClientOnboarding({ tenantId, home }: { tenantId: string; home: string }) {
  const roster = useAdminOnboardingListQuery();
  const steps = useSetupSteps();
  const remove = useAdminOnboardingRemove();
  const navigate = useNavigate();
  const [view, setView] = useState<WizardView>(savedView);
  const [deleting, setDeleting] = useState(false);

  const pick = (next: WizardView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Blocked storage: the view still switches, it just is not remembered.
    }
  };

  if (roster.isLoading || steps.isLoading) return <div className="pk-empty">Loading...</div>;
  if (roster.isError || steps.isError) return <div className="pk-empty">Onboarding did not load.</div>;

  const client = (roster.data?.clients ?? []).find((c) => c.id === tenantId);
  if (!client) return <div className="pk-empty">No onboarding record.</div>;

  const removeError = remove.error as Error | null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-2.5">
        <Segmented
          size="sm"
          value={view}
          onChange={pick}
          options={[
            { value: "stepper", label: "Stepper" },
            { value: "scroll", label: "Scroll" },
          ]}
        />
        <button
          type="button"
          onClick={() => {
            remove.reset();
            setDeleting(true);
          }}
          aria-label={`Delete ${client.name}`}
          title="Delete"
          className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] border border-border bg-surface text-faint transition-colors hover:border-danger/40 hover:text-danger"
        >
          <Trash2 size={14} aria-hidden />
        </button>
      </div>

      <ClientWizard
        key={client.id}
        client={client}
        subtitle={subtitle(client.niche, client.city, client.region) || client.slug}
        steps={steps.data?.steps ?? []}
        view={view}
      />

      {deleting && (
        <DeleteDialog
          name={client.name}
          pending={remove.isPending}
          error={removeError ? removeError.message || "That did not work." : null}
          onConfirm={() =>
            remove.mutate(client.id, { onSuccess: () => navigate(home, { replace: true }) })
          }
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
