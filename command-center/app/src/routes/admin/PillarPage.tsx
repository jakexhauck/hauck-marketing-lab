import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { PILLAR_TITLE_ACTIONS_ID } from "../../components/pillars/PillarKit";
import AdminPage from "../../components/admin/AdminPage";
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
import OnCallSection from "../../components/admin/sales/OnCallSection";
import PlaybookSection from "../../components/admin/sales/PlaybookSection";
import SalesPipelineBoard from "../../components/admin/sales/SalesPipelineBoard";
import BusinessHealthTab from "../../components/admin/operations/BusinessHealthTab";
import ScalingCalculatorTab from "../../components/admin/operations/ScalingCalculatorTab";
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
// The header is the shared <AdminPage> panel: the pillar name, its pages as a
// segmented switcher, and a slot for the surface's own controls. A page with
// sub-pages of its own (Cold Call has several) renders those as a second,
// nested strip inside its body via <AdminPage bare>.
//
// A tab body is an honest placeholder until its surface plan swaps in the real
// one (Leads, Cold Call, SMS and Sales Data are built; Calculator, Time Audit
// and Tasks are not yet). Service Delivery has its own cockpit; a direct hit on
// that id redirects there and anything unknown drops back to Command.

// What each non-owner role may open on a pillar page. A cold caller reaches
// Acquisition for exactly one tab; everything else on the pillar is not theirs.
const ROLE_TABS: Record<string, { pillar: string; tabs: string[] }> = {
  cold_caller: { pillar: "acquisition", tabs: ["cold-call"] },
};

export default function PillarPage() {
  const { pillarId } = useParams<{ pillarId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { admin } = useAuth();
  const role = effectiveAdminRole(admin?.role);

  // useParams/useSearchParams run unconditionally, before any redirect, so hook
  // order stays stable if the route param changes while this stays mounted
  // (e.g. switching pillars via the spine nav).
  const pillar = getPillar(pillarId);

  const setTab = (tab: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  };

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
      {/* The floating header panel, identical to the client app's: pillar name
          on the left, its pages as a segmented sliding switcher beside it, and
          the page's own controls (Sales Data's month stepper) pinned right
          through the PillarTitleActions portal.

          This replaced a 26px display title with the pillar as a kicker above it
          and a bottom-ruled tab row underneath. The switcher now carries the
          siblings at EVERY width, so the separate lg:hidden strip is gone: the
          sidebar dropdown and this control say the same thing, and the phone no
          longer gets a second, differently-styled copy of the same list. */}
      <AdminPage
        section={pillar.label}
        tabs={visibleTabs.map((t) => ({ id: t.id, label: t.label }))}
        active={activeTab}
        onSelect={setTab}
        actions={<div id={PILLAR_TITLE_ACTIONS_ID} className="flex items-center gap-3" />}
      >
        <div className="pk-section">
          <PillarTabBody tab={active} />
        </div>
      </AdminPage>
    </div>
  );
}

// The real body for a built tab, an honest placeholder for one that is not.
// Each surface plan adds its own case here as it lands. Every surface renders
// only its own body: the kicker, title, tagline and pk-tabs strip above it
// belong to PillarPage, and their CSS is scoped to the .pk-kit theme mounted
// once by AdminLayout.
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
    // The meetings themselves, read from the agency calendars, with the outcome
    // routed onto the Sales Pipeline.
    case "calls":
      return <SalesCallsSection />;
    // The half hour between booking a meeting and recording its outcome: the
    // playbook, worked live, ending in that same outcome.
    case "on-call":
      return <OnCallSection />;
    // Where the words in those three columns are written.
    case "playbook":
      return <PlaybookSection />;
    // The board those outcomes land on, read live and read only.
    case "pipeline":
      return <SalesPipelineBoard />;
    case "sales-data":
      return <SalesDataTracker />;
    case "business-health":
      return <BusinessHealthTab />;
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
