import SectionComingSoon from "../../components/SectionComingSoon";
import { PAID_ADS_TABS } from "../../lib/pageTabs";

export default function AdsMedia() {
  return (
    <SectionComingSoon
      tabs={PAID_ADS_TABS}
      title="Media library"
      blurb="A gallery of all the ad photos and videos in your account. This is in the works."
    />
  );
}
