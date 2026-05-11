import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
import { ALL_FORM_CONFIGS, type FormSurfaceId } from "../lib/formConfigs";
import type {
  ChatSummary,
  KnowledgeTitle,
  SkillEntry,
} from "../lib/types";

type Props = {
  open: boolean;
  root: string | null;
  chats: ChatSummary[];
  onClose: () => void;
  onOpenChat: (chat: ChatSummary) => void;
  onScaffoldSkill: (skill: SkillEntry) => void;
  onOpenKnowledge: (item: KnowledgeTitle) => void;
  onOpenDiagnosis?: () => void;
  onOpenKnowledgeBrowser?: () => void;
  onOpenHookGenerator?: () => void;
  onOpenCreativeBrief?: () => void;
  onOpenReport?: () => void;
  onOpenScaleReadiness?: () => void;
  onOpenTrackingAudit?: () => void;
  onOpenWorkflowLaunch?: () => void;
  onOpenWorkflowOptimize?: () => void;
  onOpenWorkflowScale?: () => void;
  onOpenForm?: (id: FormSurfaceId) => void;
};

type ActionRow = {
  id: string;
  label: string;
  sub: string;
  run: () => void;
};

type ResultRow =
  | { kind: "ACTION"; key: string; label: string; sub: string; data: ActionRow }
  | { kind: "SKILL"; key: string; label: string; sub: string; data: SkillEntry }
  | { kind: "CHAT"; key: string; label: string; sub: string; data: ChatSummary }
  | { kind: "KNOWLEDGE"; key: string; label: string; sub: string; data: KnowledgeTitle };

function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let streak = 0;
  let prev = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      let bonus = 1;
      if (i === prev + 1) {
        streak++;
        bonus += streak * 2;
      } else {
        streak = 0;
      }
      if (i === 0 || /[\s\-_/.]/.test(t[i - 1])) bonus += 3;
      score += bonus;
      prev = i;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

export function CommandPalette({
  open,
  root,
  chats,
  onClose,
  onOpenChat,
  onScaffoldSkill,
  onOpenKnowledge,
  onOpenDiagnosis,
  onOpenKnowledgeBrowser,
  onOpenHookGenerator,
  onOpenCreativeBrief,
  onOpenReport,
  onOpenScaleReadiness,
  onOpenTrackingAudit,
  onOpenWorkflowLaunch,
  onOpenWorkflowOptimize,
  onOpenWorkflowScale,
  onOpenForm,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [skills, setSkills] = useState<SkillEntry[] | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeTitle[] | null>(null);
  const [indexing, setIndexing] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !root || loadedRef.current) return;
    loadedRef.current = true;
    setIndexing(true);
    (async () => {
      try {
        const [s, k] = await Promise.all([
          api.listSkills(root),
          api.listKnowledgeTitles(root),
        ]);
        setSkills(s);
        setKnowledge(k);
      } catch {
        setSkills([]);
        setKnowledge([]);
      } finally {
        setIndexing(false);
      }
    })();
  }, [open, root]);

  const results = useMemo<ResultRow[]>(() => {
    if (!open) return [];
    const actionRows: ResultRow[] = [];
    if (onOpenDiagnosis) {
      actionRows.push({
        kind: "ACTION" as const,
        key: "action:diagnosis",
        label: "Run diagnosis",
        sub: "Zenith · paste or fill structured fields",
        data: {
          id: "diagnosis",
          label: "Run diagnosis",
          sub: "Zenith",
          run: onOpenDiagnosis,
        },
      });
    }
    if (onOpenKnowledgeBrowser) {
      actionRows.push({
        kind: "ACTION" as const,
        key: "action:knowledge",
        label: "Browse knowledge",
        sub: "TFC corpus · search, read, pin to chat",
        data: {
          id: "knowledge",
          label: "Browse knowledge",
          sub: "TFC corpus",
          run: onOpenKnowledgeBrowser,
        },
      });
    }
    const genRow = (
      handler: (() => void) | undefined,
      id: string,
      label: string,
      sub: string,
    ): ResultRow | null =>
      handler
        ? {
            kind: "ACTION" as const,
            key: `action:${id}`,
            label,
            sub,
            data: { id, label, sub, run: handler },
          }
        : null;
    const generatorRows: ResultRow[] = [
      genRow(onOpenHookGenerator, "hooks", "Generate hooks", "Vortex · 100-hook framework"),
      genRow(onOpenCreativeBrief, "briefs", "Build creative brief", "Vortex · designer-ready brief"),
      genRow(onOpenReport, "reports", "Build performance report", "Aurelius · client-ready report"),
      genRow(onOpenScaleReadiness, "scale", "Run scale-readiness check", "Stratos · 4-pillar verdict"),
      genRow(onOpenTrackingAudit, "audit", "Run tracking audit", "Nexus · pixel/CAPI/EMQ walk-through"),
      genRow(onOpenWorkflowLaunch, "wf-launch", "Workflow · launch", "Multi-agent launch playbook"),
      genRow(onOpenWorkflowOptimize, "wf-optimize", "Workflow · optimize", "Multi-agent diagnose + fix"),
      genRow(onOpenWorkflowScale, "wf-scale", "Workflow · scale", "Multi-agent scale playbook"),
    ].filter((r): r is ResultRow => r !== null);
    actionRows.push(...generatorRows);

    // Form-driven onboarding forms (welcome email, contract, audiences, etc.)
    if (onOpenForm) {
      for (const cfg of ALL_FORM_CONFIGS) {
        actionRows.push({
          kind: "ACTION" as const,
          key: `action:form:${cfg.id}`,
          label: cfg.title,
          sub: `${cfg.agentName} · ${cfg.subtitle.split(".")[0]}`,
          data: {
            id: `form:${cfg.id}`,
            label: cfg.title,
            sub: cfg.agentName,
            run: () => onOpenForm(cfg.id as FormSurfaceId),
          },
        });
      }
    }
    const skillRows: ResultRow[] = (skills ?? []).map((s) => ({
      kind: "SKILL" as const,
      key: `skill:${s.id}`,
      label: s.name,
      sub: s.description ?? s.id,
      data: s,
    }));
    const chatRows: ResultRow[] = chats.map((c) => ({
      kind: "CHAT" as const,
      key: `chat:${c.path}`,
      label: c.title,
      sub: c.preview ?? c.slug,
      data: c,
    }));
    const knowledgeRows: ResultRow[] = (knowledge ?? []).map((k) => ({
      kind: "KNOWLEDGE" as const,
      key: `knowledge:${k.path}`,
      label: k.title,
      sub: k.id,
      data: k,
    }));

    const q = query.trim();
    if (!q) {
      return [
        ...actionRows,
        ...chatRows.slice(0, 5),
        ...skillRows.slice(0, 5),
        ...knowledgeRows.slice(0, 5),
      ];
    }

    const scoreRow = (r: ResultRow): number => {
      if (r.kind === "ACTION") {
        return Math.max(fuzzyScore(q, r.label), fuzzyScore(q, r.sub));
      }
      if (r.kind === "SKILL") {
        const s = r.data;
        return Math.max(
          fuzzyScore(q, s.name),
          fuzzyScore(q, s.description ?? ""),
          fuzzyScore(q, s.id),
        );
      }
      if (r.kind === "CHAT") {
        const c = r.data;
        return Math.max(fuzzyScore(q, c.title), fuzzyScore(q, c.preview ?? ""));
      }
      const k = r.data;
      return Math.max(fuzzyScore(q, k.id), fuzzyScore(q, k.title));
    };

    const all = [...actionRows, ...skillRows, ...chatRows, ...knowledgeRows]
      .map((r) => ({ r, s: scoreRow(r) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map((x) => x.r);
    return all;
  }, [
    open,
    query,
    skills,
    knowledge,
    chats,
    onOpenDiagnosis,
    onOpenKnowledgeBrowser,
    onOpenHookGenerator,
    onOpenCreativeBrief,
    onOpenReport,
    onOpenScaleReadiness,
    onOpenTrackingAudit,
    onOpenWorkflowLaunch,
    onOpenWorkflowOptimize,
    onOpenWorkflowScale,
    onOpenForm,
  ]);

  useEffect(() => {
    setActive(0);
  }, [query, results.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLDivElement>(
      `.palette-row[data-idx="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) =>
          results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = results[active];
        if (!row) return;
        fire(row);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, results, active]);

  const fire = (row: ResultRow) => {
    if (row.kind === "ACTION") row.data.run();
    else if (row.kind === "SKILL") onScaffoldSkill(row.data);
    else if (row.kind === "CHAT") onOpenChat(row.data);
    else onOpenKnowledge(row.data);
  };

  if (!open) return null;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search skills, threads, knowledge…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {indexing && skills === null && knowledge === null ? (
          <div className="palette-empty">▸ indexing skills + knowledge…</div>
        ) : results.length === 0 ? (
          <div className="palette-empty">▸ no matches</div>
        ) : (
          <div className="palette-list" ref={listRef}>
            {results.map((r, i) => (
              <div
                key={r.key}
                data-idx={i}
                className={`palette-row ${i === active ? "active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => fire(r)}
              >
                <span className="palette-row-kind">{r.kind}</span>
                <span className="palette-row-label">{r.label}</span>
                <span className="palette-row-sub">{r.sub}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
