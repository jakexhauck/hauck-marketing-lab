/**
 * ClientMediaBuying — renders every media-buying form scoped to a client,
 * grouped by phase (Close / Onboard / Research / Launch / Creative / Ads etc.).
 *
 * Cards open the existing GenericFormGenerator via the onOpenForm callback,
 * which routes through MainDashboard → App.tsx so the existing modal
 * machinery stays intact.
 */

import { useMemo } from "react";
import {
  ALL_FORM_CONFIGS,
  groupFormsByCategory,
  type FormConfig,
  type FormSurfaceId,
} from "../../lib/formConfigs";

interface ClientMediaBuyingProps {
  /** Used in the empty/help copy. */
  clientName: string;
  /** Callback when a form card is clicked; opens the GenericFormGenerator. */
  onOpenForm: (id: FormSurfaceId) => void;
}

function agentBadgeClass(slug: string): string {
  const s = slug.toLowerCase();
  if (s === "vortex") return "hml-agent-badge hml-vortex";
  if (s === "stratos") return "hml-agent-badge hml-stratos";
  if (s === "nexus") return "hml-agent-badge hml-nexus";
  if (s === "zenith") return "hml-agent-badge hml-zenith";
  if (s === "aurelius") return "hml-agent-badge hml-aurelius";
  return "hml-agent-badge hml-vortex";
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
      className="hml-form-card"
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
      <div className="hml-form-card-foot">
        <span className="hml-form-card-status hml-pending">
          <span className="hml-dot" />
          Not yet run
        </span>
        <span className="hml-form-card-output hml-dim">—</span>
      </div>
    </button>
  );
}

export function ClientMediaBuying({
  clientName: _clientName,
  onOpenForm,
}: ClientMediaBuyingProps) {
  const { phaseGroups, miscGroup, reportsGroup } = useMemo(
    () => groupFormsByCategory(ALL_FORM_CONFIGS),
    [],
  );

  return (
    <div>
      {phaseGroups.map((g) => (
        <section key={g.phase} className="hml-phase-block">
          <div className="hml-phase-header">
            <span className="hml-phase-num">Phase {g.phase}</span>
            <span className="hml-phase-title">{g.phaseName}</span>
            <span className="hml-phase-progress">
              <span className="hml-dim">{g.forms.length} form{g.forms.length === 1 ? "" : "s"}</span>
            </span>
          </div>
          <div className="hml-form-grid">
            {g.forms.map((cfg) => (
              <FormCardView key={cfg.id} cfg={cfg} onOpen={onOpenForm} />
            ))}
          </div>
        </section>
      ))}

      {miscGroup && miscGroup.forms.length > 0 && (
        <section className="hml-phase-block">
          <div className="hml-phase-header">
            <span className="hml-phase-num">Misc</span>
            <span className="hml-phase-title">Standalone tools</span>
            <span className="hml-phase-progress">
              <span className="hml-dim">
                {miscGroup.forms.length} form{miscGroup.forms.length === 1 ? "" : "s"}
              </span>
            </span>
          </div>
          <div className="hml-form-grid">
            {miscGroup.forms.map((cfg) => (
              <FormCardView key={cfg.id} cfg={cfg} onOpen={onOpenForm} />
            ))}
          </div>
        </section>
      )}

      {reportsGroup && reportsGroup.forms.length > 0 && (
        <section className="hml-phase-block">
          <div className="hml-phase-header">
            <span className="hml-phase-num">Reports</span>
            <span className="hml-phase-title">Client deliverables</span>
            <span className="hml-phase-progress">
              <span className="hml-dim">
                {reportsGroup.forms.length} form{reportsGroup.forms.length === 1 ? "" : "s"}
              </span>
            </span>
          </div>
          <div className="hml-form-grid">
            {reportsGroup.forms.map((cfg) => (
              <FormCardView key={cfg.id} cfg={cfg} onOpen={onOpenForm} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
