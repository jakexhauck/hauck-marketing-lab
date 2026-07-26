import { NavLink } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Calculator,
  Clock,
  Gauge,
  Headphones,
  HeartHandshake,
  ListChecks,
  MessageSquare,
  PhoneCall,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ADMIN_PILLARS } from "../../lib/adminPillars";
import OperationsTasksTab from "../../components/admin/OperationsTasksTab";

// Command home: shortcuts into every admin surface, then the agency task list.
//
// Business Health used to live here; it is now Operations > Business Health, so
// Command is what its name says: the way into the app plus what is on the plate
// today. The tasks card is the SAME component the Operations Tasks tab renders,
// so the two are one list, not two that drift.
//
// The shortcut grid is generated from lib/adminPillars, so a new pillar tab
// appears here the moment it is declared. Only the surfaces that are not pillar
// tabs (Fulfillment, Setter Suite, Team, Settings) are hand-listed below.
//
// PillarStyle is mounted once by AdminLayout, so this page renders .pk-root and
// its own scoped .cmd-* block.

interface Shortcut {
  to: string;
  label: string;
  // The pillar (or zone) the surface belongs to, shown as a kicker on the tile
  // so a shortcut carries its address, not just its name.
  zone: string;
  icon: LucideIcon;
  end?: boolean;
}

// A tab id to its icon. A tab with no entry falls back to the generic one
// rather than dropping off the grid.
const TAB_ICONS: Record<string, LucideIcon> = {
  "cold-call": PhoneCall,
  sms: MessageSquare,
  "sales-data": BarChart3,
  "business-health": Gauge,
  calculator: Calculator,
  "time-audit": Clock,
  tasks: ListChecks,
  sops: BookOpen,
};

// Every pillar tab, in the order the pillars declare them.
const PILLAR_SHORTCUTS: Shortcut[] = ADMIN_PILLARS.flatMap((pillar) =>
  pillar.tabs.map((tab) => ({
    to: `/admin/pillar/${pillar.id}?tab=${tab.id}`,
    label: tab.label,
    zone: pillar.label,
    icon: TAB_ICONS[tab.id] ?? ListChecks,
  })),
);

// The surfaces that are real routes rather than pillar tabs.
const ROUTE_SHORTCUTS: Shortcut[] = [
  { to: "/admin/delivery", label: "Clients", zone: "Fulfillment", icon: HeartHandshake },
  { to: "/admin/setter", label: "Setter Suite", zone: "Fulfillment", icon: Headphones },
  { to: "/admin/team", label: "Team", zone: "Account", icon: Users },
  { to: "/admin/settings", label: "Settings", zone: "Account", icon: Settings },
];

const SHORTCUTS: Shortcut[] = [...PILLAR_SHORTCUTS, ...ROUTE_SHORTCUTS];

export default function AdminCommand() {
  return (
    <div className="pk-root">
      <CommandStyle />

      <h1 className="pk-title">Command</h1>
      <p className="cmd-lede">Every surface, one click away. Below it, what is on the plate.</p>

      <nav className="cmd-grid" aria-label="Shortcuts">
        {SHORTCUTS.map((s) => (
          <NavLink key={s.to} to={s.to} end={s.end} className="cmd-tile">
            <span className="cmd-tile-icon" aria-hidden>
              <s.icon size={18} />
            </span>
            <span className="cmd-tile-zone">{s.zone}</span>
            <span className="cmd-tile-label">{s.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="cmd-tasks">
        <OperationsTasksTab />
      </div>
    </div>
  );
}

// Scoped under .pk-kit so the tiles read the Modern Motion tokens in light and
// dark, matching the launcher tiles on /admin/apps.
function CommandStyle() {
  return (
    <style>{`
      .pk-kit .cmd-lede { margin-top: 4px; font-size: 13.5px; color: var(--text-muted); }

      .pk-kit .cmd-grid {
        display: grid; gap: 10px; margin-top: 18px;
        grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
      }
      .pk-kit .cmd-tile {
        display: flex; flex-direction: column; gap: 2px;
        padding: 13px 14px 14px; border-radius: 16px;
        background: var(--surface); border: 1px solid var(--border);
        box-shadow: var(--shadow-sm); text-decoration: none;
        transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
      }
      .pk-kit .cmd-tile:active { transform: scale(0.98); }
      @media (hover: hover) {
        .pk-kit .cmd-tile:hover {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--brand) 40%, var(--border));
          box-shadow: var(--shadow-md);
        }
      }
      .pk-kit .cmd-tile-icon {
        width: 36px; height: 36px; border-radius: 11px; margin-bottom: 8px;
        display: grid; place-items: center; color: #fff;
        background: var(--grad-brand); box-shadow: var(--shadow-brand);
      }
      .pk-kit .cmd-tile-zone {
        font-size: 10px; font-weight: 600; letter-spacing: .06em;
        text-transform: uppercase; color: var(--text-faint);
      }
      .pk-kit .cmd-tile-label {
        font-family: var(--font-display); font-size: 14.5px; font-weight: 600;
        color: var(--text); line-height: 1.25;
      }

      .pk-kit .cmd-tasks { margin-top: 26px; }
    `}</style>
  );
}
