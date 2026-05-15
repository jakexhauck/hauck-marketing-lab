import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";
import BrandedLogo from "./BrandedLogo";
import UserChip from "./UserChip";
import DevPanel from "./DevPanel";

export default function TopBar() {
  const { client } = useClient();
  const { currentUser } = useAuth();
  const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <BrandedLogo size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900">{client.brand.appName}</div>
        <div className="text-xs text-slate-500">{month}</div>
      </div>
      {currentUser && <UserChip user={currentUser} />}
      <DevPanel />
    </header>
  );
}
