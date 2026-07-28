import { Rocket } from "lucide-react";
import OnboardingRoster from "../../components/admin/onboarding/OnboardingRoster";
import PickPrompt from "../../components/admin/PickPrompt";

// Onboarding landing (/admin/onboarding): the client roster rail on the left,
// a prompt to pick one on the right. Its own page under Fulfillment, below the
// rule that separates the service pages from it, because standing a client up
// is its own job rather than one more service delivered to a running client.
//
// It keeps a roster rail of its own where the service pages now share a picker:
// this list is a different list (who is still being stood up, and how far
// through), and it holds the only door into the new-client wizard.
//
// Selecting a client opens their record at /admin/onboarding/:tenantId, where
// OnboardingRoster is rendered again so the rail never disappears.

export default function AdminOnboarding() {
  return (
    <div className="pk-delivery-shell">
      <OnboardingRoster />

      <div className="pk-root">
        <PickPrompt
          icon={<Rocket size={22} />}
          title="Pick a client"
          sub="Choose an account to open its onboarding record."
        />
      </div>
    </div>
  );
}
