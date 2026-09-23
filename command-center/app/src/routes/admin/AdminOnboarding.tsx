import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import OnboardingWizard from "../../components/admin/onboarding/OnboardingWizard";
import type { WizardView } from "../../components/admin/onboarding/ClientWizard";
import { Segmented } from "../../components/ui/Segmented";
import { Button } from "../../components/ui/Button";

// Onboarding (/admin/onboarding).
//
// The whole client setup checklist, one client at a time (Jake, 2026-09-23).
// It replaces the Google Doc the process used to live in: the app is now the
// only copy, and its steps are edited in Settings > Onboarding checklist.
//
// One page, two views of the same data. Stepper walks it pillar by pillar,
// Scroll shows it all at once. The choice is remembered per browser.

const VIEW_KEY = "onboarding-view";

function savedView(): WizardView {
  try {
    return localStorage.getItem(VIEW_KEY) === "scroll" ? "scroll" : "stepper";
  } catch {
    return "stepper";
  }
}

export default function AdminOnboarding() {
  const [view, setView] = useState<WizardView>(savedView);

  const pick = (next: WizardView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private window or blocked storage: the view still switches, it just
      // is not remembered.
    }
  };

  return (
    <DesktopPage
      title="Onboarding"
      actions={
        <div className="flex items-center gap-2.5">
          <Segmented
            size="sm"
            value={view}
            onChange={pick}
            options={[
              { value: "stepper", label: "Stepper" },
              { value: "scroll", label: "Scroll" },
            ]}
          />
          <Link to="/admin/clients/new">
            <Button variant="primary" size="sm">
              <Plus size={15} aria-hidden />
              Add a client
            </Button>
          </Link>
        </div>
      }
    >
      <OnboardingWizard view={view} />
    </DesktopPage>
  );
}
