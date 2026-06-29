import { CalendarDays } from "lucide-react";
import SocialStub from "./SocialStub";

export default function SocialCalendar() {
  return (
    <SocialStub
      title="Calendar"
      description="Your whole month of posts at a glance."
      icon={<CalendarDays size={22} />}
      comingTitle="Your posting calendar is on the way"
      comingBody="Soon you'll see every scheduled and published post on a month view, with open days you can fill in a tap."
    />
  );
}
