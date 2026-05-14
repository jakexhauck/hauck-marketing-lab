/**
 * ClientMediaBuying — the per-client media-buying workspace.
 *
 * Layout: a phase progress strip up top (one chip per phase), then each
 * phase as a panel with subtitle and a 3-col card grid. "Misc" and
 * "Reports" groups collapse to keep the active flow scannable.
 */

import { useMemo, useState } from "react";
import {
  ALL_FORM_CONFIGS,
  groupFormsByCategory,
  type FormConfig,
  type FormSurfaceId,
} from "../../lib/formConfigs";

interface ClientMediaBuyingProps {
  clientName: string;
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
      {cfg.subtitle && (
        <div className="hml-form-card-sub">{cfg.subtitle}</div>
      )}
      <div className="hml-form-card-foot">
        <span className="hml-form-card-status hml-pending">
          <span className="hml-dot" />
          Not yet run
        </span>
        <span className="hml-form-card-output hml-dim">Open →</span>
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

  const [showMisc, setShowMisc] = useState(false);
  const [showReports, setShowReports] = useState(false);

  const totalForms = phaseGroups.reduce((n, g) => n + g.forms.length, 0);

  return (
    <div className="hml-mb-wrap">
      <style>{mediaBuyingCSS}</style>

      {/* Phase progress strip ─────────────────────────────── */}
      <section className="hml-mb-strip">
        <div className="hml-mb-strip-head">
          <div>
            <div className="hml-mb-strip-eyebrow">Media buying flow</div>
            <div className="hml-mb-strip-title">
              {phaseGroups.length} phases · {totalForms} forms
            </div>
          </div>
        </div>
        <div className="hml-mb-strip-rail">
          {phaseGroups.map((g) => (
            <a
              key={g.phase}
              href={`#hml-mb-phase-${g.phase}`}
              className="hml-mb-chip"
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(`hml-mb-phase-${g.phase}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <span className="hml-mb-chip-num">{g.phase}</span>
              <span className="hml-mb-chip-name">{g.phaseName}</span>
              <span className="hml-mb-chip-count">
                {g.forms.length} form{g.forms.length === 1 ? "" : "s"}
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* Phases ───────────────────────────────────────────── */}
      {phaseGroups.map((g) => (
        <section
          key={g.phase}
          id={`hml-mb-phase-${g.phase}`}
          className="hml-mb-phase"
        >
          <header className="hml-mb-phase-head">
            <div className="hml-mb-phase-num">Phase {g.phase}</div>
            <h3 className="hml-mb-phase-title">{g.phaseName}</h3>
            <div className="hml-mb-phase-count">
              {g.forms.length} form{g.forms.length === 1 ? "" : "s"}
            </div>
          </header>
          <div className="hml-form-grid hml-mb-grid">
            {g.forms.map((cfg) => (
              <FormCardView key={cfg.id} cfg={cfg} onOpen={onOpenForm} />
            ))}
          </div>
        </section>
      ))}

      {/* Collapsible Misc + Reports ────────────────────────── */}
      {miscGroup && miscGroup.forms.length > 0 && (
        <section className="hml-mb-phase hml-mb-phase-collapsible">
          <button
            type="button"
            className="hml-mb-collapser"
            onClick={() => setShowMisc((s) => !s)}
          >
            <span className="hml-mb-phase-num">Misc</span>
            <span className="hml-mb-phase-title">Standalone tools</span>
            <span className="hml-mb-phase-count">
              {miscGroup.forms.length} form{miscGroup.forms.length === 1 ? "" : "s"}
            </span>
            <span className="hml-mb-caret">{showMisc ? "▴" : "▾"}</span>
          </button>
          {showMisc && (
            <div className="hml-form-grid hml-mb-grid">
              {miscGroup.forms.map((cfg) => (
                <FormCardView key={cfg.id} cfg={cfg} onOpen={onOpenForm} />
              ))}
            </div>
          )}
        </section>
      )}

      {reportsGroup && reportsGroup.forms.length > 0 && (
        <section className="hml-mb-phase hml-mb-phase-collapsible">
          <button
            type="button"
            className="hml-mb-collapser"
            onClick={() => setShowReports((s) => !s)}
          >
            <span className="hml-mb-phase-num">Reports</span>
            <span className="hml-mb-phase-title">Client deliverables</span>
            <span className="hml-mb-phase-count">
              {reportsGroup.forms.length} form{reportsGroup.forms.length === 1 ? "" : "s"}
            </span>
            <span className="hml-mb-caret">{showReports ? "▴" : "▾"}</span>
          </button>
          {showReports && (
            <div className="hml-form-grid hml-mb-grid">
              {reportsGroup.forms.map((cfg) => (
                <FormCardView key={cfg.id} cfg={cfg} onOpen={onOpenForm} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

const mediaBuyingCSS = `
.hml-mb-wrap { padding: 4px 0 32px; }

.hml-mb-strip {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  padding: 16px 18px 14px;
  margin-bottom: 24px;
}
.hml-mb-strip-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}
.hml-mb-strip-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.hml-mb-strip-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--hml-text-primary);
  letter-spacing: -0.008em;
}
.hml-mb-strip-rail {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}
.hml-mb-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 0 0 auto;
  padding: 10px 14px;
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  background: var(--hml-bg-elev-0, transparent);
  text-decoration: none;
  color: inherit;
  min-width: 140px;
  transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
}
.hml-mb-chip:hover {
  border-color: var(--hml-accent-border, var(--hml-border));
  background: var(--hml-bg-elev-2);
  transform: translateY(-1px);
}
.hml-mb-chip-num {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--hml-accent);
  text-transform: uppercase;
}
.hml-mb-chip-name {
  font-size: 13px;
  color: var(--hml-text-primary);
  font-weight: 500;
}
.hml-mb-chip-count {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  color: var(--hml-text-tertiary);
}

.hml-mb-phase {
  background: var(--hml-bg-elev-0, transparent);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  padding: 18px 20px;
  margin-bottom: 18px;
  scroll-margin-top: 16px;
}
.hml-mb-phase-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
}
.hml-mb-phase-num {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--hml-accent);
  text-transform: uppercase;
  padding: 3px 8px;
  background: var(--hml-accent-dim, rgba(212, 165, 116, 0.10));
  border-radius: 4px;
}
.hml-mb-phase-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--hml-text-primary);
  letter-spacing: -0.01em;
}
.hml-mb-phase-count {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.04em;
  margin-left: auto;
}

.hml-mb-grid {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.hml-form-card-sub {
  font-size: 12px;
  line-height: 1.45;
  color: var(--hml-text-tertiary);
  margin: -6px 0 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hml-mb-phase-collapsible { padding: 8px 18px 10px; }
.hml-mb-collapser {
  display: flex;
  width: 100%;
  align-items: baseline;
  gap: 12px;
  background: transparent;
  border: none;
  padding: 10px 0;
  cursor: pointer;
  color: inherit;
  font-family: inherit;
  text-align: left;
}
.hml-mb-collapser .hml-mb-caret {
  margin-left: 0;
  color: var(--hml-text-tertiary);
}
`;
