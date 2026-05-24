/**
 * ClientMediaBuying — the per-client forms surface inside Fulfillment.
 *
 * This is post-onboarding territory, so the layout is grouped by what the
 * form actually does (Reports / Creative / Audiences / Campaigns / Comms),
 * not by onboarding phase. Ordered most-frequently-used first.
 */

import { useMemo } from "react";
import { ALL_FORM_CONFIGS, type FormConfig, type FormSurfaceId } from "../../lib/formConfigs";

/** Display group for a form. Ordering of this array == display order in the UI. */
export type FormGroupId = "reports" | "creative" | "audiences" | "campaigns" | "comms";

interface ClientMediaBuyingProps {
  clientName: string;
  onOpenForm: (id: FormSurfaceId) => void;
  /** Restrict the panel to a subset of groups. When omitted, all groups
   *  plus the "Other" fallback render. Used by the Ads tab (everything
   *  except reports) and the Reporting tab (reports only). */
  includeGroups?: FormGroupId[];
  /** When true, hide the sticky header + jump chips for a more compact
   *  embed (e.g. when stacked under the Ads Manager dashboard). */
  compact?: boolean;
}

type FormGroupSpec = {
  id: FormGroupId;
  label: string;
  hint: string;
  /** Form IDs in this group, in the order they should render. Forms not listed
   *  here are dropped onto the end of a synthetic "Other" group as a safety net,
   *  so a newly-added form is never silently hidden. */
  formIds: string[];
};

const GROUPS: FormGroupSpec[] = [
  {
    id: "reports",
    label: "Reports",
    hint: "Recurring client deliverables. Weekly recap on Monday, monthly recap on the 1st.",
    formIds: ["weekly-report", "monthly-report"],
  },
  {
    id: "creative",
    label: "Creative",
    hint: "Generate ad copy, creative briefs, and static creatives.",
    formIds: ["ad-copy", "creative-brief"],
  },
  {
    id: "audiences",
    label: "Audiences & Research",
    hint: "Audience builds plus the research that feeds them.",
    formIds: ["audiences", "audience-research", "competitors"],
  },
  {
    id: "campaigns",
    label: "Campaign Management",
    hint: "Operate the live ad account: structure, optimization rules, tracking.",
    formIds: ["structure", "pixel-install"],
  },
  {
    id: "comms",
    label: "Client Communications",
    hint: "Outbound emails and messages. Run as needed across the engagement.",
    formIds: ["approval-email", "live-message", "welcome-email", "expectations-email", "offer-cta", "contract"],
  },
];

function agentBadgeClass(slug: string): string {
  const s = slug.toLowerCase();
  if (s === "vortex") return "hml-agent-badge hml-vortex";
  if (s === "stratos") return "hml-agent-badge hml-stratos";
  if (s === "nexus") return "hml-agent-badge hml-nexus";
  if (s === "zenith") return "hml-agent-badge hml-zenith";
  if (s === "aurelius") return "hml-agent-badge hml-aurelius";
  return "hml-agent-badge hml-vortex";
}

type GroupedForms = { spec: FormGroupSpec; forms: FormConfig[] }[];

/** Pre-compute grouping at module load. Falls back to an "Other" group for
 *  forms that aren't listed in any group so we never silently drop one. */
function buildGroups(): { groups: GroupedForms; other: FormConfig[] } {
  const byId = new Map(ALL_FORM_CONFIGS.map((f) => [f.id, f]));
  const placed = new Set<string>();
  const groups: GroupedForms = GROUPS.map((spec) => {
    const forms: FormConfig[] = [];
    for (const id of spec.formIds) {
      const cfg = byId.get(id);
      if (!cfg) continue;
      forms.push(cfg);
      placed.add(id);
    }
    return { spec, forms };
  });
  const other = ALL_FORM_CONFIGS.filter((f) => !placed.has(f.id));
  return { groups, other };
}

function FormCardView({
  cfg,
  onOpen,
}: {
  cfg: FormConfig;
  onOpen: (id: FormSurfaceId) => void;
}) {
  return (
    <button
      type="button"
      className="hml-form-card fl-card"
      onClick={() => onOpen(cfg.id as FormSurfaceId)}
      title={cfg.subtitle}
    >
      <div className="hml-form-card-top">
        <span className={agentBadgeClass(cfg.agentSlug)}>
          <span className="hml-pill-dot" />
          {cfg.agentName}
        </span>
      </div>
      <div className="hml-form-card-title">{cfg.title}</div>
      {cfg.subtitle && <div className="hml-form-card-sub">{cfg.subtitle}</div>}
      <div className="hml-form-card-foot">
        <span className="fl-card-cta">Open →</span>
      </div>
    </button>
  );
}

export function ClientMediaBuying({
  clientName: _clientName,
  onOpenForm,
  includeGroups,
  compact,
}: ClientMediaBuyingProps) {
  const { groups: allGroups, other: allOther } = useMemo(() => buildGroups(), []);
  const groups = useMemo(
    () =>
      includeGroups
        ? allGroups.filter((g) => includeGroups.includes(g.spec.id))
        : allGroups,
    [allGroups, includeGroups],
  );
  // The "Other" bucket only shows when no filter is applied — otherwise it's
  // a fallback for uncategorised forms that has no business inside a scoped
  // panel.
  const other = includeGroups ? [] : allOther;
  const totalForms =
    groups.reduce((n, g) => n + g.forms.length, 0) + other.length;

  return (
    <div className="fl-wrap">
      <style>{FULFILLMENT_CSS}</style>

      {!compact && (
        <header className="fl-header">
          <div>
            <div className="fl-header-eyebrow">Forms</div>
            <div className="fl-header-title">
              {totalForms} form{totalForms === 1 ? "" : "s"} · grouped by purpose
            </div>
          </div>
          <nav className="fl-jump">
            {groups.map((g) =>
              g.forms.length === 0 ? null : (
                <a
                  key={g.spec.id}
                  href={`#fl-group-${g.spec.id}`}
                  className="fl-jump-chip"
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById(`fl-group-${g.spec.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {g.spec.label}
                  <span className="fl-jump-count">{g.forms.length}</span>
                </a>
              ),
            )}
          </nav>
        </header>
      )}

      {groups.map((g) =>
        g.forms.length === 0 ? null : (
          <section key={g.spec.id} id={`fl-group-${g.spec.id}`} className="fl-group">
            <div className="fl-group-head">
              <div>
                <h3 className="fl-group-title">{g.spec.label}</h3>
                <p className="fl-group-hint">{g.spec.hint}</p>
              </div>
              <div className="fl-group-count">
                {g.forms.length} form{g.forms.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="fl-grid">
              {g.forms.map((cfg) => (
                <FormCardView key={cfg.id} cfg={cfg} onOpen={onOpenForm} />
              ))}
            </div>
          </section>
        ),
      )}

      {other.length > 0 && (
        <section className="fl-group">
          <div className="fl-group-head">
            <div>
              <h3 className="fl-group-title">Other</h3>
              <p className="fl-group-hint">Forms not yet categorised.</p>
            </div>
            <div className="fl-group-count">
              {other.length} form{other.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="fl-grid">
            {other.map((cfg) => (
              <FormCardView key={cfg.id} cfg={cfg} onOpen={onOpenForm} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const FULFILLMENT_CSS = `
.fl-wrap { padding: 4px 0 32px; display: flex; flex-direction: column; gap: 20px; }

.fl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 20px;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 12px;
  flex-wrap: wrap;
}
.fl-header-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  margin-bottom: 4px;
}
.fl-header-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--hml-text-primary);
  letter-spacing: -0.008em;
}
.fl-jump {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.fl-jump-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid var(--hml-border-subtle);
  border-radius: 999px;
  background: var(--hml-bg-elev-2);
  color: var(--hml-text-secondary);
  font-size: 12px;
  text-decoration: none;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.fl-jump-chip:hover {
  border-color: var(--hml-accent-border);
  color: var(--hml-accent);
  background: var(--hml-accent-dim);
}
.fl-jump-count {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  color: var(--hml-text-tertiary);
  background: var(--hml-bg-elev-1);
  padding: 1px 6px;
  border-radius: 999px;
}

.fl-group {
  background: var(--hml-bg-elev-0, transparent);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 12px;
  padding: 18px 20px 20px;
  scroll-margin-top: 16px;
}
.fl-group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
}
.fl-group-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--hml-text-primary);
  letter-spacing: -0.012em;
}
.fl-group-hint {
  margin: 0;
  font-size: 12.5px;
  color: var(--hml-text-tertiary);
  line-height: 1.5;
  max-width: 560px;
}
.fl-group-count {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.04em;
  white-space: nowrap;
  padding-top: 4px;
}

.fl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.fl-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
  font-family: inherit;
  color: inherit;
}
.fl-card:hover {
  border-color: var(--hml-accent-border);
  background: var(--hml-bg-elev-2);
  transform: translateY(-1px);
}
.fl-card .hml-form-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--hml-text-primary);
  margin: 2px 0 0;
}
.fl-card .hml-form-card-sub {
  font-size: 12px;
  line-height: 1.45;
  color: var(--hml-text-tertiary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.fl-card .hml-form-card-foot {
  margin-top: auto;
  padding-top: 8px;
  display: flex;
  justify-content: flex-end;
}
.fl-card-cta {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hml-accent);
}
`;
