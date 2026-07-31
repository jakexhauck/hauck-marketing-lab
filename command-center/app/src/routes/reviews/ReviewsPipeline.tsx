import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { REVIEWS_TABS } from "../../lib/pageTabs";
import { useAuth } from "../../context/AuthContext";
import { demoMode } from "../../demo/demoMode";
import { useReviewsFunnel } from "../../hooks/useReviewsFunnel";
import { ReviewsFunnelView } from "./ReviewsFunnelView";
import { REVIEWS_CONTAINER } from "./shared";

// The dedicated, read-only Review Pipeline page: the request -> click -> public
// review journey for the client, driven by the live review campaign. Read-only
// by design (no stage-move controls). Demo/preview reads the sample funnel from
// the demo handler; a real session reads its own counts, or an honest "not
// started yet" state until a campaign has asked anyone.
export default function ReviewsPipeline() {
  const demo = demoMode();
  const { session } = useAuth();
  // Enable for demo (served by the demo funnel handler) and for real sessions.
  const funnel = useReviewsFunnel(demo || Boolean(session));

  return (
    <Shell>
      <div className={REVIEWS_CONTAINER}>
        <PageBar
          tabs={REVIEWS_TABS}
        />
        <ReviewsFunnelView
          data={funnel.data}
          isLoading={funnel.isLoading}
          isError={funnel.isError}
          onRetry={() => funnel.refetch()}
        />
      </div>
    </Shell>
  );
}
