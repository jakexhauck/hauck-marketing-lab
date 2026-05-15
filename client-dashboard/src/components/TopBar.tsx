import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";
import BrandedLogo from "./BrandedLogo";
import UserChip from "./UserChip";
import DevPanel from "./DevPanel";

export default function TopBar() {
  const { client } = useClient();
  const { currentUser } = useAuth();
  const month = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
      <BrandedLogo size="sm" />
      <div className="min-w-0 flex-1">
        <div className="label-cap truncate">{client.brand.appName}</div>
        <div className="mt-0.5 truncate font-display text-lg font-bold tracking-tight text-slate-900">
          {month}
        </div>
      </div>
      {currentUser && <UserChip user={currentUser} />}
      <DevPanel />
    </header>
  );
}
