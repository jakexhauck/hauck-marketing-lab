import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useNotificationsQuery } from "../hooks/useApi";

// Hero-styled bell with an unread badge. Lives in the Home hero next to Search;
// matches HeroIconButton's frosted-white treatment so it reads as part of the
// dark hero. Tapping opens the notification center. The badge is driven by the
// polled unread count and caps at 9+.
export default function NotificationBell({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();
  const { data } = useNotificationsQuery(enabled);
  const unread = data?.unreadCount ?? 0;

  // Mirror the unread count onto the installed app's icon where the Badging
  // API exists (iOS 16.4+ PWAs, Android/Chrome). Best-effort.
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== "function") return;
    if (unread > 0) void nav.setAppBadge(unread).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  return (
    <button
      type="button"
      onClick={() => navigate("/notifications")}
      aria-label={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      }
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-colors active:scale-[0.96]"
      style={{ background: "rgba(255,255,255,0.14)" }}
    >
      <Bell size={18} />
      {unread > 0 && (
        <span
          className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
          style={{ background: "#e11d48" }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
