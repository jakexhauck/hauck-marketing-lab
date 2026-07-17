import { Navigate, useParams, useSearchParams } from "react-router-dom";
import {
  getPillar,
  resolvePillarTab,
  placeholderCopy,
  type PillarTabDef,
} from "../../lib/adminPillars";

// An admin pillar page (/admin/pillar/:pillarId): a Bento Bold header
// (kicker + title + tagline) and a per-pillar tab bar. The active tab is driven
// by ?tab= so a tab is linkable and survives reload, mirroring the Fulfillment
// cockpit's useSearchParams approach. PillarStyle (the .pk-kit theme) is mounted
// once by AdminLayout, so this page only renders .pk-root and the shared pk-*
// classes.
//
// Phase 1: every tab body is an honest placeholder. Each surface plan (Leads,
// Cold Call, SMS, Sales Data, Calculator, Time Audit, Tasks) swaps in its real
// body when it lands. Service Delivery has its own cockpit; a direct hit on that
// id redirects there and anything unknown drops back to Command.

export default function PillarPage() {
  const { pillarId } = useParams<{ pillarId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

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

  const activeTab = resolvePillarTab(pillar.id, searchParams.get("tab"));

  return (
    <div className="pk-root">
      <div className="pk-kicker">{pillar.kicker}</div>
      <h1 className="pk-title">{pillar.label}</h1>
      <p className="pk-tagline">{pillar.tagline}</p>

      <nav className="pk-tabs" aria-label={`${pillar.label} sections`}>
        {pillar.tabs.map((t) => (
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

      <div className="pk-section">
        <PillarTabBody tab={pillar.tabs.find((t) => t.id === activeTab)!} />
      </div>
    </div>
  );
}

// Phase 1: every pillar tab is an honest placeholder until its surface plan
// wires the real body. Surface plans replace this with a switch on tab.id.
function PillarTabBody({ tab }: { tab: PillarTabDef }) {
  return <div className="pk-empty">{placeholderCopy(tab.label)}</div>;
}
