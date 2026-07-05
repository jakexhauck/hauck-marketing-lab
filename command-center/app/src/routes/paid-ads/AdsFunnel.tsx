import SectionComingSoon from "../../components/SectionComingSoon";
import { PAID_ADS_TABS } from "../../lib/pageTabs";

export default function AdsFunnel() {
  return (
    <SectionComingSoon
      tabs={PAID_ADS_TABS}
      title="Funnel"
      blurb="When we send traffic to a landing funnel, you'll see it here. Every client starts on lead forms, so this is in the works."
    />
  );
}
