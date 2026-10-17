import BillingTab from "./BillingTab";
import ContractRail from "./ContractRail";
import ClientConfigPanel from "../ClientConfigPanel";
import SubaccountCard from "../onboarding/SubaccountCard";
import SelfDialCard from "../onboarding/SelfDialCard";
import EstimateTrackingCard from "../onboarding/EstimateTrackingCard";

// Management: a client's paperwork on one page (layout B, 2026-10-06).
//
// The Contract rail sits left and sticks on desktop, so when the contract ends
// stays in view while the right column scrolls: Cash and Account (BillingTab),
// then the client setup cards, folded closed because they are set once and
// rarely reopened. Below lg it all stacks, contract first.
//
// Each panel still owns its own load, save and error states.
//
// Brief v2 (Jake, 2026-10-17): the sub-account, dialing and estimate cards
// moved here from Client Information, which went (its answers are the brief's
// Client section now). They sit first in the right column: a client cannot
// use their app at all until the sub-account is linked.

export default function ManagementTab({
  tenantId,
  clientName,
  isLive,
}: {
  tenantId: string;
  clientName: string;
  isLive: boolean;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-4">
        <ContractRail tenantId={tenantId} />
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        <div className="flex flex-col gap-4">
          <SubaccountCard tenantId={tenantId} clientName={clientName} isLive={isLive} />
          <SelfDialCard tenantId={tenantId} />
          <EstimateTrackingCard tenantId={tenantId} />
        </div>

        <BillingTab tenantId={tenantId} />

        <div>
          <h2 className="mb-3 font-display text-[16px] font-semibold text-text">Client setup</h2>
          <ClientConfigPanel tenantId={tenantId} />
        </div>
      </div>
    </div>
  );
}
