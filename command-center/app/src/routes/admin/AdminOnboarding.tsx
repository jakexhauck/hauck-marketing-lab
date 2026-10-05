import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import OnboardingWizard from "../../components/admin/onboarding/OnboardingWizard";
import { Button } from "../../components/ui/Button";

// New client (/admin/onboarding), reached from the + chip on the client strip.
//
// A client's setup checklist moved inside their sub-account with the strip
// (Jake, 2026-10-05). The agency side keeps what has no sub-account yet: the
// intake forms that never became a client, and the button that makes one.

export default function AdminOnboarding() {
  return (
    <DesktopPage
      title="New client"
      actions={
        <Link to="/admin/clients/new">
          <Button variant="primary" size="sm">
            <Plus size={15} aria-hidden />
            Add a client
          </Button>
        </Link>
      }
    >
      <OnboardingWizard />
    </DesktopPage>
  );
}
