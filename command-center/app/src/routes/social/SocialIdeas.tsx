import { Sparkles } from "lucide-react";
import SocialStub from "./SocialStub";

export default function SocialIdeas() {
  return (
    <SocialStub
      title="Ideas"
      description="Post ideas built from your jobs, your offers, and what's working this week."
      icon={<Sparkles size={22} />}
      comingTitle="Your idea feed is on the way"
      comingBody="Soon this fills with ready-to-write posts. Tap one and it's drafted in your voice, then schedule it in a couple of clicks."
    />
  );
}
