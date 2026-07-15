import { Users } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { REACTIVATION_TABS } from "../../lib/pageTabs";
import { Panel, Badge } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { PAGE_CONTAINER } from "../../lib/layout";
import { useReactivation } from "../../hooks/useReactivation";
import { REACT_STAGE_ROWS, reactPopulated } from "../../lib/reactivation";

// Reactivation > Pipeline: a READ-ONLY view of where every reached customer
// sits right now, as a funnel of stages with live counts. No drag, no move
// controls (read-only until the backend is configured). Customer language only:
// we never name the underlying pipeline or any internal tool.

export default function ReactivationPipeline() {
  const { session } = useAuth();
  const { data } = useReactivation(Boolean(session));

  const populated = reactPopulated(data);
  const reached = data?.reached ?? 0;

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageBar
          tabs={REACTIVATION_TABS}
          description="Where everyone we reached out to sits right now. This view is read-only."
          actions={
            populated ? (
              <Badge tone="neutral">
                <Users size={12} /> {reached.toLocaleString("en-US")} reached
              </Badge>
            ) : undefined
          }
        />

        {/* Read-only funnel: one column per stage, in journey order, each
            measured against everyone reached. Renders as zeros before the
            campaign starts and fills in as customers move through. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {REACT_STAGE_ROWS.map((s) => {
            const count = data?.[s.key] ?? 0;
            const share = Math.round((count / Math.max(reached, 1)) * 100);
            return (
              <Panel key={s.key} className="flex flex-col overflow-hidden p-4">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={s.grad ? { backgroundImage: s.bar } : { background: s.bar }}
                    aria-hidden
                  />
                  <div className="font-display text-[14px] text-text">{s.label}</div>
                </div>
                <div className="mt-3 font-data text-[30px] font-semibold tnum text-text">
                  {count.toLocaleString("en-US")}
                </div>
                <div className="mt-1 text-[12px] text-faint">{s.hint}</div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(share, count > 0 ? 3 : 0)}%`,
                      ...(s.grad ? { backgroundImage: s.bar } : { background: s.bar }),
                    }}
                  />
                </div>
                <div className="mt-1.5 text-[12px] text-faint">{share}% of everyone reached</div>
              </Panel>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-[12px] text-faint">
          <Users size={13} /> {reached.toLocaleString("en-US")} customers reached so far
        </div>
      </div>
    </Shell>
  );
}
