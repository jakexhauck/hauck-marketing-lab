import SectionComingSoon from "../../components/SectionComingSoon";
import { REVIEWS_TABS } from "../../lib/pageTabs";

export default function ReviewsPipeline() {
  return (
    <SectionComingSoon
      tabs={REVIEWS_TABS}
      title="Review pipeline"
      blurb="A read-only view of who was asked, who clicked, and who left a review. This is in the works."
    />
  );
}
