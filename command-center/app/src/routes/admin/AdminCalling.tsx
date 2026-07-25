import { PhoneCall } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

// The cold caller's home (/admin/calling). This is the only surface their role
// opens, so it is where they land at sign-in and the only thing in their rail.
//
// The calling suite itself (a queue that hands over the next prospect, four
// outcome buttons, dials counted by the app rather than typed) is the next
// build. Until it exists this page says so in plain words: an empty console
// with no explanation reads as broken, and the person reading it is new.
export default function AdminCalling() {
  const { admin } = useAuth();
  const firstName = (admin?.name ?? "").trim().split(/\s+/)[0];

  return (
    <div className="pk-root">
      <div className="pk-head">
        <div className="pk-head-ic">
          <PhoneCall aria-hidden />
        </div>
        <div className="pk-head-body">
          <h1 className="pk-title">{firstName ? `Morning, ${firstName}` : "Calling"}</h1>
          <p className="pk-goal">
            Your call list lives here. You will get the next prospect handed to you one at a time,
            with their number and the script, and four buttons to log how the call went.
          </p>
        </div>
      </div>

      <div className="pk-section">
        <div className="pk-section-h">Not ready yet</div>
        <div className="pk-needs">
          The call list is still being built. Jake will tell you when it is live.
        </div>
      </div>
    </div>
  );
}
