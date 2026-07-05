import SectionComingSoon from "../../components/SectionComingSoon";
import { PAID_ADS_TABS } from "../../lib/pageTabs";

export default function AdsFunnel() {
  return (
    <SectionComingSoon
      tabs={PAID_ADS_TABS}
      title="Funnel"
      blurb="Right now your ads send people straight to a lead form, the fastest path to a call. When we start running traffic to a full landing funnel, its steps and drop-off will show up here."
    />
  );
}
