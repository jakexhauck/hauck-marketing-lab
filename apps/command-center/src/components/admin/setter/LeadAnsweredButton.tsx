import { PhoneCall, PhoneIncoming } from "lucide-react";
import { Button } from "../../ui/Button";
import { useSetterTagsMutation } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";

// The tag the setter drops the moment a lead actually picks up the phone.
// Everything downstream (that client's GHL automation, reporting on
// contact rate) keys off this exact string.
export const LEAD_CONTACTED_TAG = "lead contacted";

// True when the live contact already carries the tag, so the button shows
// state read off the CRM rather than local memory. Tag casing in GHL is not
// guaranteed, so compare normalized.
export function hasContactedTag(tags: string[] | undefined): boolean {
  return (tags ?? []).some((t) => t.trim().toLowerCase() === LEAD_CONTACTED_TAG);
}

interface Props {
  tenantId: string;
  contactId: string;
  // Whether the tag is already on the contact (from the lead detail fetch).
  answered: boolean;
}

// "The lead answered" button. Applies the `lead contacted` tag and nothing
// else: deliberately NO automation lock and no cockpit close, because the
// setter is mid-call and about to work the rest of the panel (dial ticks,
// outcome, booking) on this same lead.
export default function LeadAnsweredButton({ tenantId, contactId, answered }: Props) {
  const tags = useSetterTagsMutation();
  const { showToast } = useToast();

  const markAnswered = () => {
    if (tags.isPending || answered) return;
    tags.mutate(
      { tenantId, contactId, add: [LEAD_CONTACTED_TAG] },
      {
        onSuccess: () => showToast("Marked as answered"),
        onError: () => showToast("Could not mark as answered, please try again"),
      },
    );
  };

  return (
    <>
      <Button
        variant={answered ? "subtle" : "primary"}
        size="md"
        className="w-full"
        onClick={markAnswered}
        loading={tags.isPending}
        disabled={answered}
        title={answered ? `Already tagged: ${LEAD_CONTACTED_TAG}` : `Adds tag: ${LEAD_CONTACTED_TAG}`}
      >
        {answered ? <PhoneIncoming size={15} /> : <PhoneCall size={15} />}
        {answered ? "Answered" : "They answered"}
      </Button>
      <p className="mt-1.5 text-center text-[10px] leading-tight text-faint">
        {answered ? `Tagged ${LEAD_CONTACTED_TAG}` : `+ ${LEAD_CONTACTED_TAG}`}
      </p>
    </>
  );
}
