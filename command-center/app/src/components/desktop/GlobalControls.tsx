import { useAuth } from "../../context/AuthContext";
import GlobalSearch from "./GlobalSearch";
import AvatarMenu from "./AvatarMenu";
import ChatLauncher from "../comms/ChatLauncher";
import NotificationBell from "../NotificationBell";

// The global controls pinned to the top-right of every desktop surface: search,
// agency chat, notifications, account menu. Desktop-only (lg+) — the phone keeps
// its own hero bell and bottom bar. Shared by <PageHeader> (tab-less pages) and
// <PageBar> (Marketing sections) so the cluster stays identical everywhere.
export default function GlobalControls() {
  const { session } = useAuth();
  return (
    <div className="hidden items-center gap-2.5 lg:flex">
      <GlobalSearch />
      <ChatLauncher />
      <NotificationBell enabled={Boolean(session)} variant="surface" />
      <AvatarMenu />
    </div>
  );
}
