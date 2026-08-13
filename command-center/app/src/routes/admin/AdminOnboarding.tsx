import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import OnboardingList from "../../components/admin/onboarding/OnboardingList";
import { Button } from "../../components/ui/Button";

// Onboarding (/admin/onboarding).
//
// One flat list of everyone being stood up, and their sheet underneath when you
// open one. Nothing else.
//
// It used to be four tabs over a fifty-five step checklist, a client picker, a
// submissions queue and a step editor. The checklist went because the process
// lives in Jake's SOPs and a second copy was one to maintain and one to ignore;
// the tabs went with it, because with the checklist gone they were four ways of
// reaching the same three facts. What the app holds that nothing else does is
// what the client told us and how their account is wired, so that is the page.
//
// Keys moved out rather than disappeared: the same panel is Settings > Secrets.

export default function AdminOnboarding() {
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
    >
      <OnboardingList />
    </DesktopPage>
  );
}
