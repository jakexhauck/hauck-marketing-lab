import BillingTab from "./BillingTab";
import ClientConfigPanel from "../ClientConfigPanel";

// Fulfillment > Management: a client's paperwork on one page.
//
// This is the old Billing and Config tabs stacked rather than merged. They were
// two tabs because tabs are cheap; as sidebar rows, two rows for "the admin
// side of this client" was one row too many. Neither panel is touched: both
// already own their own load, save and error states, so stacking them costs
// nothing and keeps each one the single place its fields live.
//
// Order is deliberate. The commercial record comes first because it is the
// thing you open this page to check; the setup below it is the thing you set
// once and revisit rarely.

export default function ManagementTab({ tenantId }: { tenantId: string }) {
  return (
    <div className="flex flex-col gap-8">
      <BillingTab tenantId={tenantId} />

      <div>
        <div className="pk-section-h" style={{ margin: "0 0 12px" }}>
          Client setup
        </div>
        <ClientConfigPanel tenantId={tenantId} />
      </div>
    </div>
  );
}
