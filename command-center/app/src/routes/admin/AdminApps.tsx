import { NavLink } from "react-router-dom";
import { Gauge, PhoneCall, type LucideIcon } from "lucide-react";
import AdminPage from "../../components/admin/AdminPage";

// The Command hub: the phone's app launcher, reached from the raised center
// button in the admin bottom bar. It lists the agency's "apps" as tiles, so
// the bottom bar can stay the four pillars and Command is the way into
// everything else. New apps are one row in APPS below.
//
// This is a mobile surface. On desktop the sidebar already lists every
// destination, so the launcher is not something a desktop user needs; it still
// renders fine if reached directly, it is just not part of the desktop flow.
//
// PillarStyle is mounted once by AdminLayout, so this page renders .pk-root and
// reads the Modern Motion tokens like every other admin page.

interface AppTile {
  to: string;
  label: string;
  // One line under the label so a setter knows what the tile opens without
  // tapping it. Kept short; the tile is a launch point, not a description.
  blurb: string;
  icon: LucideIcon;
  end?: boolean;
}

// The Command dashboard is itself one of the apps here (the agency numbers),
// alongside the Setter Suite. Add a row to grow the launcher.
const APPS: AppTile[] = [
  {
    to: "/admin/pillar/operations?tab=business-health",
    label: "Business Health",
    blurb: "The agency's own numbers, period by period",
    icon: Gauge,
  },
  {
    to: "/admin/setter",
    label: "Setter Suite",
    blurb: "Work a client's leads across every pipeline",
    icon: PhoneCall,
  },
];

export default function AdminApps() {
  return (
    <div className="pk-root">
      {/* The subtitle that used to sit here is gone: header paragraphs are
          banned across the product, and a grid of labelled app tiles does not
          need a sentence telling you it is a grid of app tiles. */}
      <AdminPage section="Command" />

      <div className="grid grid-cols-2 gap-3">
        {APPS.map((app) => (
          <NavLink key={app.to} to={app.to} end={app.end} className="adm-apptile">
            <span className="adm-apptile-icon" aria-hidden>
              <app.icon size={22} />
            </span>
            <span className="adm-apptile-label">{app.label}</span>
            <span className="adm-apptile-blurb">{app.blurb}</span>
          </NavLink>
        ))}
      </div>

      <AppsStyle />
    </div>
  );
}

// Scoped under .pk-kit so the tiles read the theme tokens in light and dark.
function AppsStyle() {
  return (
    <style>{`
      .pk-kit .adm-apptile {
        display: flex; flex-direction: column; gap: 6px;
        padding: 16px 14px; border-radius: 18px;
        background: var(--surface); border: 1px solid var(--border);
        box-shadow: var(--shadow-sm); text-decoration: none;
        transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
      }
      .pk-kit .adm-apptile:active { transform: scale(0.98); }
      @media (hover: hover) {
        .pk-kit .adm-apptile:hover {
          border-color: color-mix(in srgb, var(--brand) 40%, var(--border));
          box-shadow: var(--shadow-md);
        }
      }
      .pk-kit .adm-apptile-icon {
        width: 44px; height: 44px; border-radius: 12px;
        display: grid; place-items: center; color: #fff;
        background: var(--grad-brand); box-shadow: var(--shadow-brand);
      }
      .pk-kit .adm-apptile-label {
        font-family: var(--font-display); font-size: 15px; font-weight: 600;
        color: var(--text); margin-top: 4px;
      }
      .pk-kit .adm-apptile-blurb {
        font-size: 12px; line-height: 1.35; color: var(--text-muted);
      }
    `}</style>
  );
}
