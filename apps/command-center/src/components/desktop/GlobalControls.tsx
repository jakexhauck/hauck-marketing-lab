import { useAuth } from "../../context/AuthContext";
import NotificationBell from "../NotificationBell";

// The one control pinned to the top-right of every desktop surface: the
// notification bell. Desktop-only (lg+), the phone keeps its own hero bell and
// bottom bar. Shared by <PageHeader> (tab-less pages) and <PageBar> (Marketing
// sections) so the cluster stays identical everywhere.
//
// Deliberately just the bell. Account controls (Settings, theme, sign out) live
// in the sidebar footer, mirroring the admin console's rail; global search and
// the agency chat launcher were removed from this cluster.
export default function GlobalControls() {
  const { session } = useAuth();
  return (
    <div className="hidden items-center gap-2.5 lg:flex">
      <NotificationBell enabled={Boolean(session)} variant="surface" />
    </div>
  );
}
