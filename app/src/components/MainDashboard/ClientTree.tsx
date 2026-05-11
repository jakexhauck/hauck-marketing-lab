import { useState } from "react";
import type { ClientV1 } from "./v1Data";

export type ClientSection = "overview" | "contract" | "resources" | "campaigns" | "invoices";

interface ClientTreeProps {
  client: ClientV1;
  defaultExpanded?: boolean;
  onSelect: (slug: string, section: ClientSection) => void;
}

const SECTIONS: { key: ClientSection; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "contract", label: "Contract" },
  { key: "resources", label: "Resources" },
  { key: "campaigns", label: "Campaigns" },
  { key: "invoices", label: "Invoices" },
];

export function ClientTree({ client, defaultExpanded = true, onSelect }: ClientTreeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`md-client-block${expanded ? " md-expanded" : ""}`}>
      <button
        type="button"
        className={`md-client-row${expanded ? " md-expanded" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="md-caret">▸</span>
        <span className={`md-dot md-${client.status}`} />
        <span>{client.name}</span>
      </button>
      {expanded && (
        <div className="md-client-sub">
          {SECTIONS.map((section) => {
            const badge = badgeFor(client, section.key);
            return (
              <button
                key={section.key}
                type="button"
                className="md-client-sub-item"
                onClick={() => onSelect(client.slug, section.key)}
              >
                <span className="md-micro">▸</span>
                {section.label}
                {badge && (
                  <span className={`md-badge${badge.warn ? " md-warn" : ""}`}>{badge.text}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function badgeFor(
  client: ClientV1,
  section: ClientSection,
): { text: string; warn?: boolean } | null {
  const c = client.counts;
  switch (section) {
    case "contract":
      return c.contract ? { text: c.contract } : null;
    case "resources":
      return c.resources ? { text: c.resources } : null;
    case "campaigns":
      return c.campaigns ? { text: c.campaigns } : null;
    case "invoices":
      return c.invoicesDue ? { text: c.invoicesDue, warn: true } : null;
    default:
      return null;
  }
}
