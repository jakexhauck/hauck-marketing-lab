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
import ColdCallDataTracker from "../../components/admin/tracker/ColdCallDataTracker";
import SalesCallsSection from "../../components/admin/sales/SalesCallsSection";
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
// On desktop the sidebar dropdown is the only place the sibling pages are
// listed. This page therefore shows the pillar as a kicker and the PAGE as the
// title, which leaves the strip beneath the title free for that page's own
// sub-pages (use .pk-subtabs inside the surface). Cold Call is about to need
// exactly that.
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
      {/* The page is the tab, not the pillar: the pillar is the address, shown
          as a kicker above it. This matters because the strip under the title
          belongs to THIS page's own sub-pages (Cold Call will have several), so
          it cannot also be carrying its siblings. */}
      {/* The title line carries a slot at its right end, so a surface can put
          its own controls (Sales Data's month stepper) up here instead of
          spending a whole band on them. See PillarTitleActions. */}
      <div className="pk-titlerow">
        <div>
          <div className="pk-section-h" style={{ margin: "0 0 2px" }}>
            {pillar.label}
          </div>
          <h1 className="pk-title">{active.label}</h1>
        </div>
        <div id={PILLAR_TITLE_ACTIONS_ID} className="pk-titleactions" />
      </div>

      {/* Sibling pages, on the phone only. The desktop rail's dropdown already
          does this job, and repeating it here would take the space this page's
          own sub-pages need. Below lg there is no rail, so it stays. */}
      <div className="lg:hidden">
        <nav className="pk-tabs" aria-label={`${pillar.label} sections`}>
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`pk-tab${activeTab === t.id ? " on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="pk-section" style={{ marginTop: 20 }}>
        <PillarTabBody tab={active} />
      </div>
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
    // The board those outcomes land on, read live and read only.
    case "pipeline":
      return <SalesPipelineBoard />;
    case "sales-data":
      return <SalesDataTracker />;
    // The dialing half of the funnel, every caller at once.
    case "cold-call-data":
      return <ColdCallDataTracker />;
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
