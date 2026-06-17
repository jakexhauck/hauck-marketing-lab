import { useMemo } from "react";
import {
  ALL_FORM_CONFIGS,
  type FormConfig,
  type FormSurfaceId,
} from "../lib/formConfigs";
import { ADS_SEQUENCE_FORM_IDS, MEDIA_BUYING_SEQUENCE } from "../lib/mediaBuyingSequence";
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
        border: "1px solid var(--border, var(--c-border))",
        transition: "border-color 0.15s, transform 0.05s",
        padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--copper, var(--brand))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor =
          "var(--border, var(--c-border))";
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
            color: "var(--copper, var(--brand))",
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

  /** Split this agent's forms into two buckets: Ads sequence (in execution
   *  order from MEDIA_BUYING_SEQUENCE) + everything else ("Other onboarding
   *  forms"). The phase/misc/reports grouping is deliberately bypassed here —
   *  we'll reorganize the "Other" bucket later. */
  const { adsForms, otherForms } = useMemo(() => {
    const byId = new Map(forms.map((f) => [f.id, f]));
    const ads: FormConfig[] = [];
    for (const step of MEDIA_BUYING_SEQUENCE) {
      const cfg = byId.get(step.formId);
      if (cfg) ads.push(cfg);
    }
    const other = forms.filter((f) => !ADS_SEQUENCE_FORM_IDS.has(f.id));
    return { adsForms: ads, otherForms: other };
  }, [forms]);

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
          {adsForms.length > 0 && (
            <FormGroup
              eyebrow="▸ Ads Sequence"
              title="Per-client onboarding"
              meta="run in order"
              forms={adsForms}
              onOpenForm={onOpenForm}
            />
          )}
          {otherForms.length > 0 && (
            <FormGroup
              eyebrow="▸ Other onboarding forms"
              title="Standalone tools"
              meta="anytime"
              forms={otherForms}
              onOpenForm={onOpenForm}
            />
          )}
        </section>
      )}
    </main>
  );
}

function FormGroup({
  eyebrow,
  title,
  meta,
  forms,
  onOpenForm,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  forms: FormConfig[];
  onOpenForm: (id: FormSurfaceId) => void;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border, var(--c-border))",
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--copper, var(--brand))",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
          {title}
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
          {meta}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 14,
        }}
      >
        {forms.map((cfg) => (
          <FormCard key={cfg.id} cfg={cfg} onOpen={onOpenForm} />
        ))}
      </div>
    </div>
  );
}
