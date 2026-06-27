import { RefreshCw, FlaskConical } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import { useBuilds, buildSubtitle, BuildGrid } from "../../components/admin/BuildBoard";

// Build Lab. The standalone /admin/build route: the shared BuildBoard wrapped in
// the desktop page chrome (title, stats subtitle, and the refresh + demo-view
// actions). The same board also renders inside the Operations pillar as the Build
// tab (BuildTab); both share useBuilds + BuildGrid from BuildBoard.

export default function AdminBuild() {
  const { items, error, refreshing, load } = useBuilds();

  return (
    <DesktopPage
      title="Build Lab"
      subtitle={buildSubtitle(items)}
      actions={
        <div className="flex items-center gap-2">
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
      }
    >
      <BuildGrid items={items} error={error} />
    </DesktopPage>
  );
}
