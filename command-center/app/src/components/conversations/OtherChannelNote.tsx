import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { ChannelKey } from "../../lib/inboxFilters";

// Inline note shown in a conversation when the same contact is also being
// reached on the other inbox channel. Only rendered when that other-channel
// conversation actually exists (see otherInboxChannel), so it never fabricates a
// second thread. Links to the same contact on the other page.
export default function OtherChannelNote({
  contactId,
  other,
}: {
  contactId: string;
  other: ChannelKey;
}) {
  const label = other === "sms" ? "SMS" : "email";
  return (
    <Link
      to={`/conversations/${contactId}?ch=${other}`}
      className="flex items-center gap-2 rounded-[11px] border border-brand-primary/20 bg-brand-tint/60 px-3 py-2 text-[12.5px] font-medium text-brand-text transition-colors hover:bg-brand-tint"
    >
      <span className="flex-1">
        You're also talking to this person over {label}.
      </span>
      <span className="flex shrink-0 items-center gap-1 font-semibold">
        Open {label}
        <ArrowRight size={13} />
      </span>
    </Link>
  );
}
