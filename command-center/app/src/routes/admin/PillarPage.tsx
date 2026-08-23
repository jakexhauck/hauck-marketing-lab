import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { PILLAR_TITLE_ACTIONS_ID } from "../../components/pillars/PillarKit";
import { useAuth } from "../../context/AuthContext";
import { effectiveAdminRole } from "../../lib/adminRoles";
import {
  getPillar,
  resolvePillarTab,
  placeholderCopy,
  type PillarTabDef,
} from "../../lib/adminPillars";
import SalesDataTracker from "../../components/admin/tracker/SalesDataTracker";
import SalesCallsSection from "../../components/admin/sales/SalesCallsSection";
import PlaybookSection from "../../components/admin/sales/PlaybookSection";
import SalesPipelineBoard from "../../components/admin/sales/SalesPipelineBoard";
import BusinessHealthTab from "../../components/admin/operations/BusinessHealthTab";
import InboxTab from "../../components/admin/operations/InboxTab";
import ScalingCalculatorTab from "../../components/admin/operations/ScalingCalculatorTab";
import ClientsTab from "../../components/admin/operations/ClientsTab";
import TimeAuditGrid from "../../components/admin/tracker/TimeAuditGrid";
import OperationsTasksTab from "../../components/admin/OperationsTasksTab";
import SopsTab from "../../components/admin/operations/SopsTab";
import ColdCallSection from "../../components/admin/acquisition/ColdCallSection";
import ColdSmsSurface from "../../components/admin/acquisition/ColdSmsSurface";
import LeadsSurface from "../../components/admin/acquisition/LeadsSurface";

// An admin pillar page (/admin/pillar/:pillarId). The active tab is driven by
// ?tab= so a page is linkable and survives reload, mirroring the Fulfillment
// cockpit's useSearchParams approach. PillarStyle (the .pk-kit theme) is mounted
// once by AdminLayout, so this page only renders .pk-root and the shared pk-*
// classes.
//
// There is no header here, and no switcher (Jake, 2026-08-23): the rail carries
// every pillar page as its own inline row, so a segmented strip over the body
// would be a second copy of the same list. The page renders its body straight
// away. The one thing the old header held that still matters is the
// PILLAR_TITLE_ACTIONS slot: a surface's own controls (Data's month stepper)
// portal up into it, so the empty slot stays mounted above the body and costs
// nothing while no surface is using it.
//
// A tab body is an honest placeholder until its surface plan swaps in the real
// one. Service Delivery has its own cockpit; a direct hit on that id redirects
// there and anything unknown drops back to Command.

// What each non-owner role may open on a pillar page. A cold caller reaches
// Acquisition for exactly one tab; everything else on the pillar is not theirs.
const ROLE_TABS: Record<string, { pillar: string; tabs: string[] }> = {
  cold_caller: { pillar: "acquisition", tabs: ["cold-call"] },
};

export default function PillarPage() {
  const { pillarId } = useParams<{ pillarId: string }>();
  const [searchParams] = useSearchParams();
  const { admin } = useAuth();
  const role = effectiveAdminRole(admin?.role);

  // useParams/useSearchParams run unconditionally, before any redirect, so hook
  // order stays stable if the route param changes while this stays mounted
  // (e.g. switching pillars via the spine nav).
  const pillar = getPillar(pillarId);

  // Service Delivery has its own dedicated cockpit route; keep this as a
  // defensive redirect in case the page is reached directly rather than through
  // the static /admin/pillar/delivery route in App.tsx.
  if (pillarId === "delivery") return <Navigate to="/admin/delivery" replace />;
  if (!pillar) return <Navigate to="/admin" replace />;

  // A hired role sees only its own tabs, and only on its own pillar. Landing
  // anywhere else sends them back to the one page they have.
  const limit = role === "owner" ? null : ROLE_TABS[role];
  if (limit && limit.pillar !== pillar.id) {
    return <Navigate to={`/admin/pillar/${limit.pillar}?tab=${limit.tabs[0]}`} replace />;
  }
  const visibleTabs = limit
    ? pillar.tabs.filter((t) => limit.tabs.includes(t.id))
    : pillar.tabs;

  const requested = resolvePillarTab(pillar.id, searchParams.get("tab"));
  const activeTab = visibleTabs.some((t) => t.id === requested)
    ? requested
    : visibleTabs[0].id;

  const active = visibleTabs.find((t) => t.id === activeTab)!;

  return (
    <div className="pk-root">
      {/* The surface-controls slot, alone where the header used to be: pinned
          right, and zero-height while nothing is portalled into it. */}
      <div className="flex items-center justify-end">
        <div id={PILLAR_TITLE_ACTIONS_ID} className="flex items-center gap-3" />
      </div>
      <div className="pk-section">
        <PillarTabBody tab={active} />
      </div>
    </div>
  );
}

// The real body for a built tab, an honest placeholder for one that is not.
// Each surface plan adds its own case here as it lands. Every surface renders
// only its own body: there is no header above it, the rail row is the title.
// Cases whose tabs are out of the config (calls, playbook, and the retired
// Operations pages) stay wired deliberately: nothing renders them, and putting
// a row back in lib/adminPillars is the whole of restoring one.
function PillarTabBody({ tab }: { tab: PillarTabDef }) {
  if (!tab.ready) return <div className="pk-empty">{placeholderCopy(tab.label)}</div>;

  switch (tab.id) {
    // Cold Call is a section with its own pages (queue, callbacks, booked,
    // tracker, scoreboard, settings), not a single surface.
    case "cold-call":
      return <ColdCallSection />;
    case "sms":
      return <ColdSmsSurface />;
    // Sourcing: the scraper's results, and the hand-off into the two above.
    case "leads":
      return <LeadsSurface />;
    // Retired from the nav (Jake, 2026-08-23). The meetings themselves, read
    // from the agency calendars, with the outcome routed onto the Pipeline:
    // Data reads the same reconciliation, so no numbers were lost with the
    // page. An old ?tab=calls or ?tab=on-call link falls through
    // resolvePillarTab to Pipeline; this case only fires if a row comes back.
    case "calls":
      return <SalesCallsSection />;
    // Retired with it: where the words on that call are written. The playbook
    // data itself is untouched and the call cockpit still reads it.
    case "playbook":
      return <PlaybookSection />;
    // The board those outcomes land on, read live and read only.
    case "pipeline":
      return <SalesPipelineBoard />;
    // The month in aggregate.
    case "sales-data":
      return <SalesDataTracker />;
    case "business-health":
      return <BusinessHealthTab />;
    // The agency's own GoHighLevel messages, read and answered by text.
    case "inbox":
      return <InboxTab />;
    // Every live client, opening onto the same sheet Onboarding shows.
    case "clients":
      return <ClientsTab />;
    case "calculator":
      return <ScalingCalculatorTab />;
    case "time-audit":
      return <TimeAuditGrid />;
    case "tasks":
      return <OperationsTasksTab />;
    case "sops":
      return <SopsTab />;
    default:
      // A tab marked ready with no body wired is a bug, not a state to render
      // something plausible for.
      return <div className="pk-empty">{placeholderCopy(tab.label)}</div>;
  }
}
