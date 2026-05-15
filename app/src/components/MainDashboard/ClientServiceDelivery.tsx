/**
 * ClientFulfillment. Consolidated tab that hosts the per-client delivery
 * surfaces (Forms, Websites, Drive, Recordings) behind a single sub-nav.
 *
 * Pure presentation: owns sub-tab state, defers rendering the active body
 * to a render-prop so the parent decides which component to mount and only
 * the active one runs.
 *
 * (Previously called "Service Delivery". Kept the file name for now to
 * minimise diff churn; the exported component is `ClientServiceDelivery`
 * still, but the user-facing label is "Fulfillment".)
 */

import { useState, type ReactNode } from "react";
import { IconBarChart, IconFolder, IconGlobe, IconRecordings } from "../icons";

export type ServiceDeliveryTab = "forms" | "websites" | "drive" | "recordings";

interface ClientServiceDeliveryProps {
  clientName: string;
  initialTab?: ServiceDeliveryTab;
  children: (active: ServiceDeliveryTab) => ReactNode;
}

const TABS: { id: ServiceDeliveryTab; label: string; hint: string; Icon: typeof IconBarChart }[] = [
  {
    id: "forms",
    label: "Forms",
    hint: "Run any agent form for this client. Grouped by purpose.",
    Icon: IconBarChart,
  },
  {
    id: "recordings",
    label: "Recordings",
    hint: "Fathom call recordings for this client.",
    Icon: IconRecordings,
  },
  {
    id: "websites",
    label: "Websites",
    hint: "Build, revamp, and host landing pages for this client.",
    Icon: IconGlobe,
  },
  {
    id: "drive",
    label: "Drive",
    hint: "Indexed view of the client's Google Drive folder.",
    Icon: IconFolder,
  },
];

export function ClientServiceDelivery({
  clientName,
  initialTab = "forms",
  children,
}: ClientServiceDeliveryProps) {
  const [active, setActive] = useState<ServiceDeliveryTab>(initialTab);
  const meta = TABS.find((t) => t.id === active);

  return (
    <div className="hml-content sd-wrap">
      <nav className="sd-subnav" role="tablist" aria-label="Fulfillment sections">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            className={`sd-subnav-item${active === id ? " sd-subnav-item-active" : ""}`}
            onClick={() => setActive(id)}
          >
            <Icon className="sd-subnav-icon" />
            <span>{label}</span>
          </button>
        ))}
        {meta && <span className="sd-subnav-hint">{meta.hint}</span>}
        <span className="sd-subnav-client">{clientName}</span>
      </nav>

      <div className="sd-body" role="tabpanel" aria-label={meta?.label ?? active}>
        {children(active)}
      </div>

      <style>{SERVICE_DELIVERY_CSS}</style>
    </div>
  );
}

const SERVICE_DELIVERY_CSS = `
.sd-wrap { display: flex; flex-direction: column; gap: 16px; }

.sd-subnav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  flex-wrap: wrap;
}
.sd-subnav-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--hml-text-secondary);
  padding: 7px 12px;
  border-radius: 7px;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.sd-subnav-item:hover {
  background: var(--hml-bg-elev-2);
  color: var(--hml-text-primary);
}
.sd-subnav-item-active {
  background: var(--hml-accent-dim);
  border-color: var(--hml-accent-border);
  color: var(--hml-accent);
}
.sd-subnav-icon { opacity: 0.9; }

.sd-subnav-hint {
  margin-left: 14px;
  padding-left: 14px;
  border-left: 1px solid var(--hml-border-subtle);
  font-size: 11.5px;
  color: var(--hml-text-tertiary);
  flex: 1;
  min-width: 180px;
}
.sd-subnav-client {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  padding: 4px 10px;
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
}

.sd-body { min-height: 200px; }
`;
