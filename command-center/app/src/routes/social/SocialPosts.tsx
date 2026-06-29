import { LayoutGrid } from "lucide-react";
import SocialStub from "./SocialStub";

export default function SocialPosts() {
  return (
    <SocialStub
      title="My Posts"
      description="Everything you've scheduled, drafted, and published."
      icon={<LayoutGrid size={22} />}
      comingTitle="Your posts will live here"
      comingBody="Soon this is your own pipeline: scheduled, drafts, and published posts, each with how it performed."
    />
  );
}
