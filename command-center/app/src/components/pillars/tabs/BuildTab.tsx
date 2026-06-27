import { RefreshCw, FlaskConical } from "lucide-react";
import { Button } from "../../ui/Button";
import { useBuilds, buildSubtitle, BuildGrid } from "../../admin/BuildBoard";

// Build tab for the Operations pillar: the Build Lab board, in-workspace. The
// pillar header already carries the title, so this just adds the stats line and
// the refresh + demo-view actions above the shared BuildGrid. Same board and the
// same useBuilds fetch as the standalone /admin/build route.
export default function BuildTab() {
  const { items, error, refreshing, load } = useBuilds();

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-muted">{buildSubtitle(items)}</p>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => window.open("/home?demo=1", "_blank")}
            title="Open the client app in a new tab with fabricated demo data"
          >
            <FlaskConical size={16} /> Demo client view
          </Button>
          <Button variant="secondary" onClick={() => void load()} title="Refresh the board">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      <BuildGrid items={items} error={error} />
    </div>
  );
}
