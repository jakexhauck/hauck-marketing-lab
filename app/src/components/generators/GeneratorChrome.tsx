import { useEffect, useRef } from "react";
import type { GeneratorOutput, StreamEvent } from "../../lib/types";
import { api } from "../../lib/tauri";

export function extractJson(src: string): Record<string, unknown> | null {
  const startIdx = src.indexOf("```json");
  if (startIdx === -1) return null;
  const after = src.slice(startIdx + "```json".length).replace(/^\n/, "");
  const endIdx = after.indexOf("```");
  if (endIdx === -1) return null;
  const block = after.slice(0, endIdx).trim();
  try {
    return JSON.parse(block) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function useStreamListener(
  onDelta: (text: string) => void,
  onError: (message: string) => void,
) {
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let mounted = true;
    api
      .onClaudeStream((evt: StreamEvent) => {
        if (!mounted) return;
        if (evt.kind === "delta") onDelta(evt.text);
        else if (evt.kind === "error") onError(evt.message);
      })
      .then((un) => {
        if (!mounted) un();
        else unlistenFn = un;
      });
    return () => {
      mounted = false;
      if (unlistenFn) unlistenFn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useEscapeClose(onClose: () => void, busy: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
}

export function HeroBar({
  eyebrow,
  tag,
  clientName,
  onClose,
  closeDisabled,
  title,
  body,
}: {
  eyebrow: string;
  tag: string;
  clientName: string;
  onClose: () => void;
  closeDisabled: boolean;
  title: React.ReactNode;
  body: React.ReactNode;
}) {
  return (
    <section className="hero reveal reveal-1">
      <div className="hero-eyebrow">
        <span>{eyebrow}</span>
        <span className="verdict">{tag}</span>
        <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontWeight: 400 }}>
          CLIENT · {clientName.toUpperCase()}
        </span>
        <button
          type="button"
          className="drawer-close"
          onClick={onClose}
          disabled={closeDisabled}
          aria-label="Close"
          style={{ marginLeft: 12 }}
        >
          ×
        </button>
      </div>
      <h1>{title}</h1>
      <p className="hero-body">{body}</p>
    </section>
  );
}

export function StreamPanel({
  agentName,
  streaming,
  streamText,
}: {
  agentName: string;
  streaming: boolean;
  streamText: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamText]);
  return (
    <section className="panel reveal reveal-4" style={{ marginBottom: 32 }}>
      <div className="panel-head">
        <span className="panel-title">▸ {agentName.toUpperCase()} · DRAFTING</span>
        <span className="panel-meta">{streaming ? "streaming" : "complete"}</span>
      </div>
      <div ref={ref} className="thread" style={{ maxHeight: 480, padding: 0, gap: 0 }}>
        <div className="msg agent">
          <div className="msg-label">{agentName.toUpperCase()} ›</div>
          <div className="msg-body">
            {streamText}
            {streaming && <span className="caret" />}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ErrorPanel({ error }: { error: string }) {
  return (
    <section
      className="panel reveal"
      style={{ marginBottom: 32, borderLeft: "2px solid var(--signal-stop)" }}
    >
      <div className="panel-head">
        <span className="panel-title" style={{ color: "var(--signal-stop)" }}>
          ▸ ERROR
        </span>
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--signal-stop)" }}>
        {error}
      </div>
    </section>
  );
}

export function SavedHeader({
  output,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  badge,
  badgeTone,
}: {
  output: GeneratorOutput;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  badge?: string | null;
  badgeTone?: { background: string; borderColor: string; color: string };
}) {
  return (
    <section className="panel reveal reveal-3" style={{ marginBottom: 24 }}>
      <div className="panel-head">
        <span className="panel-title">▸ SAVED</span>
        <span className="panel-meta">{output.path.split(/[\\/]/).slice(-2).join("/")}</span>
      </div>
      {badge && (
        <div className="hero-eyebrow" style={{ marginBottom: 18, paddingTop: 6 }}>
          <span>VERDICT</span>
          <span className="verdict" style={badgeTone}>
            ▸ {badge.toUpperCase()}
          </span>
        </div>
      )}
      <div className="diag-headline" style={{ marginBottom: 12 }}>
        {output.title}
      </div>
      {output.summary && (
        <p className="hero-body" style={{ marginBottom: 18, fontSize: 15, color: "var(--text-mid)" }}>
          {output.summary}
        </p>
      )}
      <div className="actions-row">
        <button type="button" className="action primary" onClick={onPrimary}>
          {primaryLabel}
        </button>
        <button type="button" className="action" onClick={onSecondary}>
          {secondaryLabel}
        </button>
      </div>
    </section>
  );
}

export function FullTranscript({
  title,
  agent,
  body,
  maxHeight = 600,
}: {
  title: string;
  agent: string;
  body: string;
  maxHeight?: number;
}) {
  return (
    <section className="panel reveal reveal-4">
      <div className="panel-head">
        <span className="panel-title">{title}</span>
        <span className="panel-meta">{agent.toLowerCase()} · verbatim</span>
      </div>
      <div className="thread" style={{ maxHeight, padding: 0, gap: 0 }}>
        <div className="msg agent">
          <div className="msg-label">{agent.toUpperCase()} ›</div>
          <div className="msg-body">{body}</div>
        </div>
      </div>
    </section>
  );
}
