import { Link, useSearchParams } from "react-router-dom";
import ClientSetupView from "../../components/admin/onboarding/ClientSetupView";
import OnboardingManagement from "../../components/admin/onboarding/OnboardingManagement";
import SubmissionsView from "../../components/admin/onboarding/SubmissionsView";
import KeysPanel from "../../components/admin/secrets/KeysPanel";
import {
  ONBOARDING_VIEWS,
  resolveOnboardingView,
  type OnboardingView,
} from "../../lib/onboardingViews";
import { Plus } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { TAB_TRACK, TabButton } from "../../components/PageTabs";
import { Button } from "../../components/ui/Button";

// Onboarding (/admin/onboarding).
//
// One page: pick a client, work down their checklist, press Go Live when it is
// done and they leave the page. Management is the same list of steps seen from
// the other side, where editing one changes it for every client.
//
// It used to open on a pipeline board of intake submissions waiting to be
// approved. The approval step is gone (a finished funnel form creates the client
// itself), which left a board whose every card said the same thing and whose
// every card linked here. See onboardingViews.ts.

export default function AdminOnboarding() {
  const [viewParams, setViewParams] = useSearchParams();
  const view = resolveOnboardingView(viewParams.get("view"));

  const setView = (next: OnboardingView) => {
    setViewParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("view", next);
        return p;
      },
      { replace: true },
    );
  };

  return (
    <DesktopPage
      title="Onboarding"
      actions={
        <Link to="/admin/clients/new">
          <Button variant="primary" size="sm">
            <Plus size={15} aria-hidden />
            Add a client
          </Button>
        </Link>
      }
      // The two views switch state rather than routes, so they are a segmented
      // track inside the header panel, exactly where a client page's tabs sit.
      tabs={
        <div className={TAB_TRACK}>
          {ONBOARDING_VIEWS.map((v) => (
            <TabButton key={v.id} active={v.id === view} onClick={() => setView(v.id)}>
              {v.label}
            </TabButton>
          ))}
        </div>
      }
    >
      {view === "keys" ? (
        <KeysPanel />
      ) : view === "submissions" ? (
        <SubmissionsView />
      ) : view === "management" ? (
        <OnboardingManagement />
      ) : (
        <ClientSetupView />
      )}
    </DesktopPage>
  );
}
