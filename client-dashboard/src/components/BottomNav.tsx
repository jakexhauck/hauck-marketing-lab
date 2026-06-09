import { useNavigate } from "react-router-dom";
import { Home, List, MessageSquare, Users } from "lucide-react";
import type { ComponentType } from "react";

export type NavKey = "home" | "leads" | "conversations" | "contacts";

interface NavItem {
  key: NavKey;
  label: string;
  to: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

const ITEMS: NavItem[] = [
  { key: "home", label: "Home", to: "/home", Icon: Home },
  { key: "leads", label: "Leads", to: "/leads", Icon: List },
  {
    key: "conversations",
    label: "Chats",
    to: "/conversations",
    Icon: MessageSquare,
  },
  { key: "contacts", label: "Contacts", to: "/contacts", Icon: Users },
];

export default function BottomNav({ active }: { active: NavKey }) {
  const navigate = useNavigate();
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-[var(--border)] bg-[var(--surface)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch pt-1.5">
        {ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (!isActive) navigate(item.to);
              }}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 pb-2 pt-0.5"
              style={{
                color: isActive
                  ? "var(--brand-primary)"
                  : "var(--text-faint)",
              }}
            >
              <item.Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
              <span className="text-[10.5px] font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
