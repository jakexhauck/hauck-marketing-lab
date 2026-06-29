import { BarChart3 } from "lucide-react";
import SocialStub from "./SocialStub";

export default function SocialInsights() {
  return (
    <SocialStub
      title="What's working"
      description="Plain-English performance: what's getting you calls, and when to post."
      icon={<BarChart3 size={22} />}
      comingTitle="Your results, in plain English"
      comingBody="Soon you'll see which posts drive calls and messages, your best time to post, and your top posts, without the vanity metrics."
    />
  );
}
