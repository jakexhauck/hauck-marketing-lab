import GhlSetupWizard from "./GhlSetupWizard";
import BusinessProfilePage from "./setup/BusinessProfilePage";
import StaffPage from "./setup/StaffPage";
import CustomValuesPage from "./setup/CustomValuesPage";
import CustomFieldsPage from "./setup/CustomFieldsPage";
import CalendarsPage from "./setup/CalendarsPage";
import PipelinesPage from "./setup/PipelinesPage";
import MediaPage from "./setup/MediaPage";
import WorkflowsPage from "./setup/WorkflowsPage";
import PhoneNumbersPage from "./setup/PhoneNumbersPage";
import { GHL_SETUP_SUB, placeholderCopy, subTabsFor } from "../../../../lib/fulfillmentPages";

// Client > GHL. One page per GHL setup screen, in the Mission Control GHL Setup
// order, each laid out like GHL's own and reading and writing the client's real
// sub-account (Jake, 2026-10-26; ./setup). Until the sub-account is linked the
// only page is the Connect wizard.

export default function GhlTab({
  tenantId,
  clientName,
  locationId,
  activeSub,
  ghlConnected,
  onSelectSub,
}: {
  tenantId: string;
  clientName: string;
  locationId: string;
  activeSub: string;
  /** Whether this client has real GHL credentials on their row. */
  ghlConnected: boolean;
  onSelectSub: (sub: string) => void;
}) {
  // Belt and braces with the gate in lib/fulfillmentPages.ts: every page reads
  // the sub-account, so an unlinked client gets the wizard wherever they land.
  if (activeSub === GHL_SETUP_SUB || !ghlConnected) {
    return <GhlSetupWizard tenantId={tenantId} clientName={clientName} onFinished={onSelectSub} />;
  }

  const p = { tenantId, locationId };
  switch (activeSub) {
    case "business-profile":
      return <BusinessProfilePage {...p} />;
    case "staff":
      return <StaffPage {...p} />;
    case "custom-values":
      return <CustomValuesPage {...p} />;
    case "custom-fields":
      return <CustomFieldsPage {...p} />;
    case "calendars":
      return <CalendarsPage {...p} />;
    case "pipelines":
      return <PipelinesPage {...p} />;
    case "media":
      return <MediaPage {...p} />;
    case "workflows":
      return <WorkflowsPage {...p} />;
    case "phone-numbers":
      return <PhoneNumbersPage {...p} />;
    default: {
      const label = subTabsFor("ghl").find((s) => s.id === activeSub)?.label ?? "This";
      return <div className="pk-empty">{placeholderCopy(label)}</div>;
    }
  }
}
