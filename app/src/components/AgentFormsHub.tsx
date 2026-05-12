import { useMemo } from "react";
import {
  ALL_FORM_CONFIGS,
  groupFormsByCategory,
  type FormConfig,
  type FormSurfaceId,
} from "../lib/formConfigs";
import type { AgentSummary } from "../lib/types";

type Props = {
  agent: AgentSummary;
  clientName: string;
  onOpenForm: (id: FormSurfaceId) => void;
  onClose: () => void;
};

function FormCard({
  cfg,
  onOpen,
}: {
  cfg: FormConfig;
  onOpen: (id: FormSurfaceId) => void;
}) {
  return (
    <button
      key={cfg.id}
      type="button"
      className="panel"
      onClick={() => onOpen(cfg.id as FormSurfaceId)}
      style={{
        textAlign: "left",
        cursor: "pointer",
        background: "var(--bg-surface, transparent)",
        border: "1px solid var(--border, rgba(180,200,240,0.08))",
        transition: "border-color 0.15s, transform 0.05s",
        padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--copper, #ec9849)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor =
          "var(--border, rgba(180,200,240,0.08))";
      }}
    >
      <div className="panel-head">
        <span className="panel-title">{cfg.eyebrow}</span>
        {cfg.eyebrowMeta && <span className="panel-meta">{cfg.eyebrowMeta}</span>}
      </div>
      <div style={{ padding: "0 18px 18px" }}>
        <div
          style={{
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--text)",
            marginBottom: 6,
          }}
        >
          {cfg.title}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
          {cfg.subtitle}
        </div>
        <div
          style={{
            marginTop: 14,
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--copper, #ec9849)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Open form →
        </div>
      </div>
    </button>
  );
}

export function AgentFormsHub({ agent, clientName, onOpenForm, onClose }: Props) {
  const forms = useMemo(
    () =>
      ALL_FORM_CONFIGS.filter(
        (cfg) => cfg.agentSlug.toLowerCase() === agent.slug.toLowerCase(),
      ),
    [agent.slug],
  );

  const { phaseGroups, miscGroup } = useMemo(
    () => groupFormsByCategory(forms),
    [forms],
  );

  return (
    <main className="main" style={{ position: "relative" }}>
      <section className="hero reveal reveal-1">
        <div className="hero-eyebrow">
          <span>▸ {agent.name.toUpperCase()} · FORMS</span>
          {agent.role && <span className="verdict">{agent.role.toUpperCase()}</span>}
          <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontWeight: 400 }}>
            CLIENT · {clientName.toUpperCase()}
          </span>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label={`Close ${agent.name} forms`}
            style={{ marginLeft: 12 }}
          >
            ×
          </button>
        </div>
        <h1>
          <strong>{agent.name}</strong>
        </h1>
        {agent.description && <p className="hero-body">{agent.description}</p>}
        <p
          className="hero-body"
          style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}
        >
          Pick a form. Fill it in. {agent.name} handles the rest.
        </p>
      </section>

      {forms.length === 0 ? (
        <section className="panel reveal reveal-2" style={{ marginBottom: 32 }}>
          <div className="panel-head">
            <span className="panel-title">▸ NO FORMS YET</span>
          </div>
          <p className="hero-body" style={{ fontSize: 14, color: "var(--text-muted)" }}>
            No forms are configured for {agent.name} yet. Forms will appear here as they're added.
          </p>
        </section>
      ) : (
        <section className="reveal reveal-2" style={{ marginBottom: 32 }}>
          {phaseGroups.map((group) => (
            <div key={group.phase} style={{ marginBottom: 28 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--border, rgba(180,200,240,0.08))",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    color: "var(--copper, #ec9849)",
                    textTransform: "uppercase",
                  }}
                >
                  ▸ Phase {String(group.phase).padStart(2, "0")}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  {group.phaseName}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    color: "var(--text-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {group.phaseMeta}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: 14,
                }}
              >
                {group.forms.map((cfg) => (
                  <FormCard key={cfg.id} cfg={cfg} onOpen={onOpenForm} />
                ))}
              </div>
            </div>
          ))}

          {miscGroup && (
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--border, rgba(180,200,240,0.08))",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    color: "var(--copper, #ec9849)",
                    textTransform: "uppercase",
                  }}
                >
                  ▸ Misc
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  Tools
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    color: "var(--text-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  anytime
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: 14,
                }}
              >
                {miscGroup.forms.map((cfg) => (
                  <FormCard key={cfg.id} cfg={cfg} onOpen={onOpenForm} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
