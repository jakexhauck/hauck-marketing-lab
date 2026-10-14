import ConversationInbox, {
  type InboxConfig,
} from "../../components/sales/ConversationInbox";
import { useEstimateForms } from "../../hooks/useEstimateForms";
import { GATED_NOTE } from "./shared";

// The Estimate Forms surface: a conversation inbox over inbound website
// estimate requests (Organic Pipeline, source = "Website Form"). It is the
// shared ConversationInbox with forms-flavoured copy + the forms dataset; the
// twin Chat Widget page is the same surface with source = "chat widget".

const FORMS_CONFIG: InboxConfig = {
  title: "Estimate Forms",
  description: "Estimate requests from your website, with auto email + SMS follow-up.",
  countLabel: (n) => `${n} submissions · auto email + SMS follow-up`,
  emptyTitle: "No submissions yet",
  emptyBody:
    "When someone fills out an estimate form on your website, they will show up here with their reply, ready to call.",
  // notConnectedMessage omitted → NotConnectedNotice uses its forms default.
  gatedNote: GATED_NOTE,
};

export default function EstimateForms() {
  const data = useEstimateForms();
  return <ConversationInbox config={FORMS_CONFIG} data={data} />;
}
