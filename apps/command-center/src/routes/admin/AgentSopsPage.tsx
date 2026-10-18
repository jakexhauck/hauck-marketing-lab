import { NavLink, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AgentSopMap from "../../components/admin/sops/AgentSopMap";
import { useDirector } from "../../components/admin/director/directorApi";
import { AGENT_SOPS, getAgentSop } from "../../lib/agentSops";

// /admin/sops/:agent (Jake, 2026-10-17). One sub-page per agent, each its flow
// map. The agent pills are the sub-page links, so a map is linkable and the
// Open map button on a handoff box is an ordinary navigation. Anything unknown
// lands on the Manager.
//
// The Director's board rides in (Jake, 2026-10-18): box names, Off boxes and
// added tasks come from it. ?node=<id> or ?task=<id> opens that box, which is
// where a Director card's Steps button lands.
export default function AgentSopsPage() {
  const { agent } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const director = useDirector();
  const initial = params.get("node") ?? (params.get("task") ? `task:${params.get("task")}` : null);
  const map = getAgentSop(agent);
  if (!map) return <Navigate to="/admin/sops/manager" replace />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 lg:px-6 lg:py-5">
      <nav className="flex gap-1.5 overflow-x-auto" aria-label="Agents">
        {AGENT_SOPS.map((a) => (
          <NavLink
            key={a.id}
            to={`/admin/sops/${a.id}`}
            className={({ isActive }) =>
              [
                "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition-colors",
                isActive
                  ? "border-transparent text-white shadow-[var(--shadow-brand)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]",
              ].join(" ")
            }
            style={({ isActive }) => (isActive ? { backgroundImage: "var(--grad-brand)" } : undefined)}
          >
            {a.name}
            {a.draft && (
              <span className="rounded-full bg-[color-mix(in_srgb,#d97706_18%,transparent)] px-[7px] py-px text-[10.5px] font-bold text-[#d97706]">
                Draft
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <AgentSopMap key={map.id} map={map} director={director.data} initial={initial} onOpenAgent={(id) => navigate(`/admin/sops/${id}`)} />
    </div>
  );
}
