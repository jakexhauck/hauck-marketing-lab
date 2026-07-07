import { Waypoints } from "lucide-react";
import { Panel, EmptyState } from "../../../ui";

// Paid Ads > Funnel. No funnel-step endpoint exists yet (Jake's call): this
// mirrors the client's own AdsFunnel copy (src/routes/paid-ads/AdsFunnel.tsx),
// reworded for the admin operator. Honest "coming soon", not a fabricated
// funnel with fake steps/drop-off. No data fetch.

export default function FunnelPanel() {
  return (
    <Panel className="px-4 py-12">
      <EmptyState
        icon={<Waypoints size={22} />}
        title="Funnel is coming soon"
        description="Right now this client's ads send people straight to a lead form, the fastest path to a call. Once we run traffic to a full landing funnel, its steps and drop-off will show up here."
      />
    </Panel>
  );
}
