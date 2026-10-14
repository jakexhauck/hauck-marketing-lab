import BillingTab from "./BillingTab";
import ContractRail from "./ContractRail";
import ClientConfigPanel from "../ClientConfigPanel";

// Management: a client's paperwork on one page (layout B, 2026-10-06).
//
// The Contract rail sits left and sticks on desktop, so when the contract ends
// stays in view while the right column scrolls: Cash and Account (BillingTab),
// then the client setup cards, folded closed because they are set once and
// rarely reopened. Below lg it all stacks, contract first.
//
// Each panel still owns its own load, save and error states.

export default function ManagementTab({ tenantId }: { tenantId: string }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-4">
        <ContractRail tenantId={tenantId} />
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        <BillingTab tenantId={tenantId} />

        <div>
          <h2 className="mb-3 font-display text-[16px] font-semibold text-text">Client setup</h2>
          <ClientConfigPanel tenantId={tenantId} />
        </div>
      </div>
    </div>
  );
}
