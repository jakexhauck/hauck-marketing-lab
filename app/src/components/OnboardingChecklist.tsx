import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ONBOARDING_PLAN,
  phaseTaskCount,
  phaseTaskIds,
  requiredPhaseTaskIds,
  totalTasks,
  type OnboardingInlineField,
  type OnboardingPhase,
  type OnboardingTask,
} from "../lib/onboardingPlan";
import {
  MEDIA_BUYING_SEQUENCE,
  emptySequenceState,
  isStepDone,
  nextStepId,
  sequenceComplete,
  type SequenceState,
  type SequenceStep,
  type SequenceStepId,
} from "../lib/mediaBuyingSequence";
import { syncOnboardingPhase } from "../lib/ghlSync";
import { api } from "../lib/tauri";
import { getFormConfig, type FormValues, type FormSurfaceId } from "../lib/formConfigs";
import type { AgentSummary, GeneratorOutput, OnboardingState } from "../lib/types";
import { GenericFormGenerator } from "./GenericFormGenerator";
import ProvisionMobileAppForm from "./ProvisionMobileAppForm";
import { AdsSequenceWizard } from "./AdsSequenceWizard";
import { SkillChat } from "./CopywriterChat";
import { IconArrowRight } from "./icons";
import "./onboarding-checklist.css";

type GhlSyncStatus =
  | { kind: "idle" }
  | { kind: "syncing"; phase: number }
  | { kind: "ok"; phase: number; stageName: string }
  | { kind: "err"; phase: number; message: string };

/** Legacy localStorage key — read once on first load to migrate, then cleared. */
const LEGACY_STORAGE_PREFIX = "hml-onboarding-v1:";

type Props = {
  /** Vault root; required to persist to disk. When null, state stays in-memory. */
  root: string | null;
  clientName: string;
  clientSlug: string;
  agents: AgentSummary[];
  onComplete: () => void;
};

type Persisted = {
  done: string[];
  skippedOptional: string[];
  phaseDoneAt: Record<string, string>;
  sequence?: OnboardingState["sequence"];
};

function readLegacyLocal(slug: string): Persisted | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      done: Array.isArray(parsed.done) ? parsed.done : [],
      skippedOptional: Array.isArray(parsed.skippedOptional)
        ? parsed.skippedOptional
        : [],
      phaseDoneAt:
        parsed.phaseDoneAt && typeof parsed.phaseDoneAt === "object"
          ? parsed.phaseDoneAt
          : {},
    };
  } catch {
    return null;
  }
}

function clearLegacyLocal(slug: string): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_PREFIX + slug);
  } catch {
    // ignore
  }
}

function formatToday(): string {
  const now = new Date();
  return now
    .toLocaleDateString(undefined, { day: "2-digit", month: "short" })
    .toUpperCase();
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function extractJsonFromBody(body: string): Record<string, unknown> | null {
  const start = body.indexOf("```json");
  if (start === -1) return null;
  const after = body.slice(start + "```json".length).replace(/^\n/, "");
  const end = after.indexOf("```");
  if (end === -1) return null;
  try {
    return JSON.parse(after.slice(0, end).trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Profile.md H2 heading written for each inline-field kind. */
const PROFILE_SECTION_BY_KIND: Record<string, string> = {
  "profile-budget": "Monthly Budget",
  "profile-offer-cta": "Offer + CTA",
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pull the body text of an H2 section out of a markdown body. Returns "" when
 *  the heading is absent. Trims surrounding whitespace. */
function readSection(body: string, heading: string): string {
  const re = new RegExp(
    `(?:^|\\n)##\\s+${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|\\s*$)`,
    "i",
  );
  const m = re.exec(body);
  return m ? m[1].trim() : "";
}

/** Replace the body of an H2 section with `content`, or append a new section
 *  at the end of `body` when the heading is missing. */
function upsertSection(body: string, heading: string, content: string): string {
  const re = new RegExp(
    `((?:^|\\n)##\\s+${escapeRegex(heading)}\\s*\\n)([\\s\\S]*?)(?=\\n##\\s+|\\s*$)`,
    "i",
  );
  if (re.test(body)) {
    return body.replace(re, `$1${content}\n`);
  }
  const trimmed = body.replace(/\s+$/, "");
  return `${trimmed}\n\n## ${heading}\n${content}\n`;
}

/** Task ID that triggers writing `adsLaunchedAt` into the Client Dashboard
 *  (`ops/clients.json`) when first checked. Idempotent. */
const ADS_PUBLISH_TASK_ID = "06-publish";

/** Task ID for "Provision mobile app". Opens a custom form that calls the
 *  `provision_mobile_tenant` Tauri command instead of the GenericFormGenerator
 *  Claude-driven flow. */
const PROVISION_MOBILE_APP_TASK_ID = "04app-provision";

/** Master task ID for the consolidated Ads sequence. Opens AdsSequenceWizard
 *  (three-column launcher over MEDIA_BUYING_SEQUENCE) instead of a single form. */
const ADS_MASTER_TASK_ID = "06-ads";

/** Competitor research task. Opens a free-form chat with the data-analyst skill
 *  (not a form): paste competitor Google reviews and it pulls out the recurring
 *  pain points. Saving a reply persists it as the competitor artifact downstream
 *  agents read. */
const COMPETITOR_RESEARCH_TASK_ID = "03-competitors";

/** Data-analyst persona for the competitor-research chat. Mirrors the inline
 *  AgentSummary the copywriter chat uses; only the slug/name/labels differ. */
const DATA_ANALYST_AGENT: AgentSummary = {
  slug: "data-analyst",
  name: "Data Analyst",
  initial: "D",
  short: "Data Analyst",
  role: "Ad campaign data analyst",
  description: "Data analyst skill",
  path: "",
};

/** Stable loader for the data-analyst persona body. Module-level so its
 *  reference never changes, otherwise the chat would re-fetch every render. */
const loadDataAnalystSkill = (root: string) => api.readSkillBody(root, "data-analyst");

/** Map of checklistTaskId → SequenceStep, so a row can render a "Generate"
 *  button if the task has a matching form. Built once at module load.
 *  Sequence steps without a checklistTaskId are skipped. */
const STEP_BY_TASK: Map<string, SequenceStep> = new Map(
  MEDIA_BUYING_SEQUENCE.filter((s): s is SequenceStep & { checklistTaskId: string } =>
    Boolean(s.checklistTaskId),
  ).map((s) => [s.checklistTaskId, s]),
);

/** Standalone checklist tasks that open a form directly (not part of the Ads
 *  sequence). Used for Pre-Call Prep, where Offer + CTA and Competitor Research
 *  live outside the sequence wizard but still need a "Open form" button. */
const FORM_BY_TASK: Map<string, FormSurfaceId> = new Map([
  ["02-offer-options", "offer-cta"],
  ["03-pixel", "pixel-install"],
]);

export function OnboardingChecklist({ root, clientName, clientSlug, agents, onComplete }: Props) {
  const [doneSet, setDoneSet] = useState<Set<string>>(() => new Set());
  const [skippedSet, setSkippedSet] = useState<Set<string>>(() => new Set());
  const [phaseDoneAt, setPhaseDoneAt] = useState<Record<string, string>>({});
  const [onboardingDay, setOnboardingDay] = useState<number | null>(null);
  const [sequenceState, setSequenceState] = useState<SequenceState>(() => emptySequenceState());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ghlSync, setGhlSync] = useState<GhlSyncStatus>({ kind: "idle" });
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [chainValues, setChainValues] = useState<Partial<FormValues>>({});
  const [loadingChain, setLoadingChain] = useState(false);
  // Inline field state: per-task draft text, last-saved snapshot (so we can
  // show "Saved" vs "Unsaved" without re-reading the vault), and a transient
  // saving/error flag. Keys are task IDs.
  const [inlineDraft, setInlineDraft] = useState<Record<string, string>>({});
  const [inlineSaved, setInlineSaved] = useState<Record<string, string>>({});
  const [inlineStatus, setInlineStatus] = useState<
    Record<string, "idle" | "saving" | "error">
  >({});
  // Highest phase number already pushed to GHL for this client mount.
  const lastSyncedPhase = useRef<number>(0);
  // Suppress the persist effect until after the load resolves.
  const skipNextPersist = useRef(true);
  const saveTimer = useRef<number | null>(null);

  // Load from disk on mount / client change.
  useEffect(() => {
    let cancelled = false;
    skipNextPersist.current = true;
    setSelectedIndex(null);
    setOpenTaskId(null);
    setInlineDraft({});
    setInlineSaved({});
    setInlineStatus({});
    void (async () => {
      let next: Persisted = { done: [], skippedOptional: [], phaseDoneAt: {} };
      let needsMigrationWrite = false;

      if (root) {
        try {
          const state = await api.readOnboardingState(root, clientSlug);
          next = {
            done: state.done ?? [],
            skippedOptional: state.skippedOptional ?? [],
            phaseDoneAt: state.phaseDoneAt ?? {},
            sequence: state.sequence,
          };
        } catch {
          next = { done: [], skippedOptional: [], phaseDoneAt: {} };
        }
        if (next.done.length === 0 && Object.keys(next.phaseDoneAt).length === 0) {
          const legacy = readLegacyLocal(clientSlug);
          if (legacy && (legacy.done.length > 0 || Object.keys(legacy.phaseDoneAt).length > 0)) {
            next = legacy;
            needsMigrationWrite = true;
          }
        }
      } else {
        const legacy = readLegacyLocal(clientSlug);
        if (legacy) next = legacy;
      }

      if (cancelled) return;
      setDoneSet(new Set(next.done));
      setSkippedSet(new Set(next.skippedOptional));
      setPhaseDoneAt(next.phaseDoneAt);
      if (next.sequence) {
        setSequenceState({
          currentStep: next.sequence.currentStep as SequenceStepId,
          stepOutputs: next.sequence.stepOutputs as SequenceState["stepOutputs"],
          skipped: next.sequence.skipped as SequenceStepId[] | undefined,
          launchedAt: next.sequence.launchedAt,
          driveFolderId: next.sequence.driveFolderId,
          campaignSkeleton: next.sequence.campaignSkeleton as SequenceState["campaignSkeleton"],
        });
      } else {
        setSequenceState(emptySequenceState());
      }
      const seeded = Object.keys(next.phaseDoneAt)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n));
      lastSyncedPhase.current = seeded.length ? Math.max(...seeded) : 0;
      setGhlSync({ kind: "idle" });
      setLoaded(true);

      if (needsMigrationWrite && root) {
        try {
          await api.writeOnboardingState(root, clientSlug, {
            done: next.done,
            skippedOptional: next.skippedOptional,
            phaseDoneAt: next.phaseDoneAt,
          });
          clearLegacyLocal(clientSlug);
        } catch {
          // leave the legacy copy; retry next mount
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  // Persist on change, debounced 300ms.
  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    if (!root || !loaded) return;
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void api
        .writeOnboardingState(root, clientSlug, {
          done: Array.from(doneSet),
          skippedOptional: Array.from(skippedSet),
          phaseDoneAt,
          sequence: sequenceState,
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("onboarding persist failed", err);
        });
    }, 300);
  }, [root, clientSlug, doneSet, skippedSet, phaseDoneAt, sequenceState, loaded]);

  useEffect(
    () => () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  // Read the client's onboarding start date from ops/clients.json so the
  // progress strip can show "Day N." Prefers invoicePaidAt (real onboarding
  // start) and falls back to startDate. Re-runs whenever doneSet changes so
  // a fresh paid invoice gets picked up without a full reload.
  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    void (async () => {
      try {
        const ops = await api.readOpsClients(root);
        const row = ops.rows[clientSlug] ?? {};
        const start = row.invoicePaidAt ?? row.startDate;
        if (!start) {
          if (!cancelled) setOnboardingDay(null);
          return;
        }
        const startMs = new Date(start).getTime();
        if (!Number.isFinite(startMs)) {
          if (!cancelled) setOnboardingDay(null);
          return;
        }
        const days = Math.max(0, Math.floor((Date.now() - startMs) / 86400000));
        if (!cancelled) setOnboardingDay(days);
      } catch {
        if (!cancelled) setOnboardingDay(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug, doneSet]);

  // Auto-tick the 06-ads parent task when every wizard step is done. Wizard
  // steps don't tick checklist tasks directly anymore (the 04-* IDs they used
  // to reference were phantoms), so this is how Phase 4 closes out.
  useEffect(() => {
    if (!loaded) return;
    if (!sequenceComplete(sequenceState)) return;
    setDoneSet((prev) => {
      if (prev.has(ADS_MASTER_TASK_ID)) return prev;
      const next = new Set(prev);
      next.add(ADS_MASTER_TASK_ID);
      return next;
    });
  }, [sequenceState, loaded]);

  // Auto-populate `adsLaunchedAt` on the Workspace > Clients row when the
  // publish task lands. Only writes when empty.
  useEffect(() => {
    if (!root || !loaded) return;
    if (!doneSet.has(ADS_PUBLISH_TASK_ID)) return;

    let cancelled = false;
    void (async () => {
      try {
        const opsFile = await api.readOpsClients(root);
        if (cancelled) return;
        const existing = opsFile.rows[clientSlug] ?? {};
        if (existing.adsLaunchedAt) return;
        await api.writeOpsClients(root, {
          rows: {
            ...opsFile.rows,
            [clientSlug]: { ...existing, adsLaunchedAt: todayYMD() },
          },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("auto-populate adsLaunchedAt failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug, doneSet, loaded]);

  // Preload inline-field values from Profile.md so the inputs show what's
  // already on disk. Memory.md isn't preloaded — the Fathom field is
  // append-only, no "current value" to surface. Best-effort; if the read
  // fails (no profile yet, fresh client) we silently leave the inputs blank.
  useEffect(() => {
    if (!root || !loaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const note = await api.readVaultNote(
          root,
          `Clients/${clientName}/Profile.md`,
        );
        if (cancelled) return;
        const body = note?.body ?? "";
        const initial: Record<string, string> = {};
        for (const phase of ONBOARDING_PLAN) {
          for (const ss of phase.subsections) {
            for (const t of ss.tasks) {
              const f = t.inlineField;
              if (!f) continue;
              const heading = PROFILE_SECTION_BY_KIND[f.kind];
              if (!heading) continue;
              const v = readSection(body, heading);
              if (v) initial[t.id] = v;
            }
          }
        }
        setInlineSaved((prev) => ({ ...initial, ...prev }));
        setInlineDraft((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(initial)) {
            if (next[k] == null) next[k] = v;
          }
          return next;
        });
      } catch {
        // no profile yet; leave blank
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, clientName, loaded]);

  const saveInlineField = useCallback(
    async (taskId: string, field: OnboardingInlineField, raw: string) => {
      if (!root) return;
      const value = raw.trim();
      if (!value) return;
      setInlineStatus((prev) => ({ ...prev, [taskId]: "saving" }));
      try {
        if (field.kind === "memory-fathom") {
          await api.appendToMemory(
            root,
            clientSlug,
            `Fathom recording: ${value}`,
          );
        } else {
          const heading = PROFILE_SECTION_BY_KIND[field.kind];
          if (!heading) throw new Error(`unknown inline field kind: ${field.kind}`);
          const path = `Clients/${clientName}/Profile.md`;
          const note = await api.readVaultNote(root, path);
          const nextBody = upsertSection(note.body ?? "", heading, value);
          await api.writeVaultNote(root, path, note.front, nextBody);
        }
        setInlineSaved((prev) => ({ ...prev, [taskId]: value }));
        setInlineDraft((prev) => ({ ...prev, [taskId]: value }));
        setInlineStatus((prev) => ({ ...prev, [taskId]: "idle" }));
        setDoneSet((prev) => {
          if (prev.has(taskId)) return prev;
          const next = new Set(prev);
          next.add(taskId);
          return next;
        });
        setSkippedSet((prev) => {
          if (!prev.has(taskId)) return prev;
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("inline field save failed", err);
        setInlineStatus((prev) => ({ ...prev, [taskId]: "error" }));
      }
    },
    [root, clientName, clientSlug],
  );

  const total = useMemo(() => totalTasks(), []);
  const doneCount = doneSet.size;

  // Sub-progress for the Ads task (06-ads). Phase 4 looks like 1 task on the
  // surface but masks an 8-step wizard, so surface the wizard's progress on
  // the task row to keep the checklist honest.
  const adsSubProgress = useMemo(() => {
    const done = MEDIA_BUYING_SEQUENCE.filter((s) =>
      isStepDone(sequenceState, s.id),
    ).length;
    return { done, total: MEDIA_BUYING_SEQUENCE.length };
  }, [sequenceState]);

  const phaseStates = useMemo(() => {
    return ONBOARDING_PLAN.map((p) => {
      const ids = phaseTaskIds(p);
      const requiredIds = requiredPhaseTaskIds(p);
      const completed = ids.filter((id) => doneSet.has(id)).length;
      const requiredCompleted = requiredIds.filter((id) => doneSet.has(id)).length;
      return {
        phase: p,
        completed,
        total: ids.length,
        requiredCompleted,
        requiredTotal: requiredIds.length,
      };
    });
  }, [doneSet]);

  // A phase is "done" when every REQUIRED task is ticked. Optional tasks are
  // tracked but don't block phase completion (e.g. GA access).
  const activeIndex = phaseStates.findIndex(
    (s) => s.requiredCompleted < s.requiredTotal,
  );

  const expandedIndex =
    selectedIndex !== null && selectedIndex >= 0 && selectedIndex < phaseStates.length
      ? selectedIndex
      : activeIndex;

  useEffect(() => {
    setPhaseDoneAt((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of phaseStates) {
        const key = String(s.phase.num);
        const phaseDone = s.requiredCompleted === s.requiredTotal;
        if (phaseDone && !next[key]) {
          next[key] = formatToday();
          changed = true;
        } else if (!phaseDone && next[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [phaseStates]);

  // GHL sync.
  useEffect(() => {
    if (!loaded) return;
    const completedPhases = phaseStates
      .filter((s) => s.requiredCompleted === s.requiredTotal)
      .map((s) => s.phase.num);
    if (completedPhases.length === 0) return;
    const maxCompleted = Math.max(...completedPhases);
    if (maxCompleted <= lastSyncedPhase.current) return;

    const target = maxCompleted;
    lastSyncedPhase.current = target;
    setGhlSync({ kind: "syncing", phase: target });
    let cancelled = false;
    void (async () => {
      const result = await syncOnboardingPhase({
        root: root ?? "",
        clientSlug,
        clientName,
        phaseNum: target,
      });
      if (cancelled) return;
      if (result.ok) {
        setGhlSync({
          kind: "ok",
          phase: target,
          stageName: result.stageName ?? "",
        });
      } else {
        lastSyncedPhase.current = Math.max(0, target - 1);
        setGhlSync({ kind: "err", phase: target, message: result.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phaseStates, loaded, root, clientSlug, clientName]);

  const retryGhlSync = useCallback(() => {
    if (ghlSync.kind !== "err") return;
    lastSyncedPhase.current = Math.max(0, ghlSync.phase - 1);
    setPhaseDoneAt((prev) => ({ ...prev }));
  }, [ghlSync]);

  const toggleTask = useCallback((id: string) => {
    setDoneSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Ticking a task clears any prior N/A flag — done wins over skipped.
    setSkippedSet((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleSkip = useCallback((id: string) => {
    setSkippedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Marking N/A also clears the checked state to avoid contradictory UI.
    setDoneSet((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  /** Open the form attached to a task. Reads any chain-from outputs and seeds
   *  the form. Mirrors the prior ClientSequence behavior. */
  const openTaskForm = useCallback(
    async (taskId: string) => {
      if (
        taskId === PROVISION_MOBILE_APP_TASK_ID ||
        taskId === ADS_MASTER_TASK_ID ||
        taskId === COMPETITOR_RESEARCH_TASK_ID
      ) {
        setOpenTaskId(taskId);
        setChainValues({});
        return;
      }
      const step = STEP_BY_TASK.get(taskId);
      if (!step) {
        if (FORM_BY_TASK.has(taskId)) {
          setOpenTaskId(taskId);
          setChainValues({});
        }
        return;
      }
      if (!root) return;
      setOpenTaskId(taskId);
      setChainValues({});
      if (!step.chainFrom) return;
      const specs = Array.isArray(step.chainFrom) ? step.chainFrom : [step.chainFrom];
      if (specs.length === 0) return;
      setLoadingChain(true);
      try {
        const mapped: Partial<FormValues> = {};
        for (const spec of specs) {
          const priorRec = sequenceState.stepOutputs[spec.step];
          if (!priorRec?.path) continue;
          const note = await api.readVaultNote(root, priorRec.path);
          const body = note?.body ?? "";
          if (spec.rawBodyField) {
            mapped[spec.rawBodyField] = body;
          }
          const parsed = extractJsonFromBody(body);
          if (!parsed) continue;
          for (const [sourceKey, targetField] of Object.entries(spec.fields)) {
            const v = parsed[sourceKey];
            if (typeof v === "string" || typeof v === "number") mapped[targetField] = v;
            else if (Array.isArray(v)) mapped[targetField] = v.map(String);
          }
        }
        setChainValues(mapped);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("chainFrom prefill failed:", e);
      } finally {
        setLoadingChain(false);
      }
    },
    [root, sequenceState],
  );

  const closeForm = useCallback(() => {
    setOpenTaskId(null);
    setChainValues({});
  }, []);

  /** When a form saves, tick the task AND persist the sequence output so
   *  downstream chain-prefill still works. */
  const handleFormSaved = useCallback(
    (output: GeneratorOutput) => {
      if (!openTaskId) return;
      const step = STEP_BY_TASK.get(openTaskId);
      const now = new Date().toISOString();
      setDoneSet((prev) => {
        const n = new Set(prev);
        n.add(openTaskId);
        return n;
      });
      if (step) {
        setSequenceState((prev) => ({
          ...prev,
          currentStep: nextStepId(step.id) ?? prev.currentStep,
          stepOutputs: {
            ...prev.stepOutputs,
            [step.id]: { path: output.path, completedAt: now },
          },
        }));
      }
    },
    [openTaskId],
  );

  const fillPct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;
  const currentPhaseNum = activeIndex === -1 ? ONBOARDING_PLAN.length : ONBOARDING_PLAN[activeIndex].num;

  // Render the form overlay when a task with a sequence step is opened.
  const openStep = openTaskId ? STEP_BY_TASK.get(openTaskId) : null;
  const openStepFormConfig = openStep ? getFormConfig(openStep.formId) : null;
  const standaloneFormId = openTaskId && !openStep ? FORM_BY_TASK.get(openTaskId) ?? null : null;
  const standaloneFormConfig = standaloneFormId ? getFormConfig(standaloneFormId) : null;
  const standaloneFormLabel = openTaskId
    ? ONBOARDING_PLAN.flatMap((p) => p.subsections.flatMap((s) => s.tasks)).find(
        (t) => t.id === openTaskId,
      )?.label ?? "Open form"
    : "Open form";

  if (openTaskId === ADS_MASTER_TASK_ID && root) {
    return (
      <div className="ob-root">
        <AdsSequenceWizard
          root={root}
          clientName={clientName}
          clientSlug={clientSlug}
          agents={agents}
          sequenceState={sequenceState}
          onSequenceChange={(next) => setSequenceState(next)}
          onTaskTick={(taskId) =>
            setDoneSet((prev) => {
              if (prev.has(taskId)) return prev;
              const n = new Set(prev);
              n.add(taskId);
              return n;
            })
          }
          onClose={closeForm}
        />
        <style>{FORM_OVERLAY_CSS}</style>
      </div>
    );
  }

  if (openTaskId === PROVISION_MOBILE_APP_TASK_ID) {
    return (
      <div className="ob-root">
        <div className="ob-form-head">
          <button type="button" className="ob-form-back" onClick={closeForm}>
            ← Back to onboarding
          </button>
          <div className="ob-form-meta">
            <span className="ob-form-task">Provision mobile app</span>
          </div>
        </div>
        <ProvisionMobileAppForm
          clientName={clientName}
          clientSlug={clientSlug}
          onClose={closeForm}
          onProvisioned={() => {
            setDoneSet((prev) => {
              const n = new Set(prev);
              n.add(PROVISION_MOBILE_APP_TASK_ID);
              return n;
            });
          }}
        />
        <style>{FORM_OVERLAY_CSS}</style>
      </div>
    );
  }

  if (openTaskId === COMPETITOR_RESEARCH_TASK_ID && root) {
    return (
      <div className="ob-root">
        <div className="ob-form-head">
          <button type="button" className="ob-form-back" onClick={closeForm}>
            ← Back to onboarding
          </button>
          <div className="ob-form-meta">
            <span className="ob-form-task">Competitor research</span>
            <span className="ob-form-hint">
              Paste competitor (and any client) Google reviews. The data analyst
              pulls out the recurring pain points.
            </span>
          </div>
        </div>
        <SkillChat
          root={root}
          clientName={clientName}
          clientSlug={clientSlug}
          agent={DATA_ANALYST_AGENT}
          loadSkill={loadDataAnalystSkill}
          onClose={closeForm}
        />
        <style>{FORM_OVERLAY_CSS}</style>
      </div>
    );
  }

  if (openStep && openStepFormConfig && root) {
    return (
      <div className="ob-root">
        <div className="ob-form-head">
          <button type="button" className="ob-form-back" onClick={closeForm}>
            ← Back to onboarding
          </button>
          <div className="ob-form-meta">
            <span className="ob-form-task">{openStep.label}</span>
            {loadingChain && <span className="ob-form-hint">Loading prior outputs,</span>}
            {!loadingChain &&
              openStep.chainFrom &&
              Object.keys(chainValues).length > 0 && (
                <span className="ob-form-hint">
                  Prefilled from{" "}
                  {(Array.isArray(openStep.chainFrom)
                    ? openStep.chainFrom
                    : [openStep.chainFrom]
                  )
                    .map((s) => s.step)
                    .join(" + ")}
                </span>
              )}
          </div>
        </div>
        <GenericFormGenerator
          config={openStepFormConfig}
          root={root}
          agents={agents}
          clientName={clientName}
          clientSlug={clientSlug}
          onClose={closeForm}
          initialValues={chainValues}
          onSaved={handleFormSaved}
        />
        <style>{FORM_OVERLAY_CSS}</style>
      </div>
    );
  }

  if (standaloneFormConfig && root) {
    return (
      <div className="ob-root">
        <div className="ob-form-head">
          <button type="button" className="ob-form-back" onClick={closeForm}>
            ← Back to onboarding
          </button>
          <div className="ob-form-meta">
            <span className="ob-form-task">{standaloneFormLabel}</span>
          </div>
        </div>
        <GenericFormGenerator
          config={standaloneFormConfig}
          root={root}
          agents={agents}
          clientName={clientName}
          clientSlug={clientSlug}
          onClose={closeForm}
          onSaved={handleFormSaved}
        />
        <style>{FORM_OVERLAY_CSS}</style>
      </div>
    );
  }

  return (
    <div className="ob-root">
      <div className="ob-progress-strip">
        <div className="ob-progress-inner">
          <span className="ob-progress-label">▸ Onboarding</span>
          <span className="ob-progress-count">
            <em>{doneCount}</em> of {total} tasks
          </span>
          <div className="ob-progress-bar">
            <div className="ob-fill" style={{ width: `${fillPct}%` }} />
            {Array.from({ length: ONBOARDING_PLAN.length - 1 }, (_, i) => (
              <span
                key={i}
                className="ob-marker"
                style={{ left: `${((i + 1) * 100) / ONBOARDING_PLAN.length}%` }}
              />
            ))}
          </div>
          <span className="ob-progress-count">
            Phase <em>{Math.min(currentPhaseNum, ONBOARDING_PLAN.length)}</em> / {ONBOARDING_PLAN.length}
          </span>
          {onboardingDay !== null && (
            <span className="ob-progress-count" title="Days since invoice paid">
              Day <em>{onboardingDay}</em>
            </span>
          )}
          <GhlSyncPill status={ghlSync} onRetry={retryGhlSync} />
        </div>
      </div>

      <main className="ob-stack">
        {phaseStates.map((s, i) => {
          // Phase completion is gated on REQUIRED tasks only, matching
          // activeIndex and phaseDoneAt. Optional tasks don't block it, so a
          // phase with its required work done renders as Done even if an
          // optional task is still unticked.
          const isDone = s.requiredCompleted === s.requiredTotal;
          const isActive = i === expandedIndex;
          if (isActive) {
            return (
              <ActiveCard
                key={s.phase.num}
                phase={s.phase}
                doneSet={doneSet}
                skippedSet={skippedSet}
                completed={s.completed}
                onToggle={toggleTask}
                onToggleSkip={toggleSkip}
                onOpenForm={openTaskForm}
                canOpenForm={!!root}
                adsSubProgress={adsSubProgress}
                inlineDraft={inlineDraft}
                inlineSaved={inlineSaved}
                inlineStatus={inlineStatus}
                onInlineChange={(taskId, value) =>
                  setInlineDraft((prev) => ({ ...prev, [taskId]: value }))
                }
                onInlineSave={saveInlineField}
              />
            );
          }
          if (isDone) {
            return (
              <DoneCard
                key={s.phase.num}
                phase={s.phase}
                completedAt={phaseDoneAt[String(s.phase.num)]}
                onSelect={() => setSelectedIndex(i)}
              />
            );
          }
          return (
            <UpcomingCard
              key={s.phase.num}
              phase={s.phase}
              onSelect={() => setSelectedIndex(i)}
            />
          );
        })}
      </main>

      {allDone && (
        <div className="ob-graduate">
          <button type="button" onClick={onComplete}>
            ▸ Onboarding complete · open client dashboard →
          </button>
        </div>
      )}

      <div className="ob-foot">
        <span className="ob-line" />
        <span>
          {clientName} · {ONBOARDING_PLAN.length} phases · {total} tasks
        </span>
        <span className="ob-line" />
      </div>

      {!allDone && (
        <div className="ob-graduate ob-graduate-skip">
          <button
            type="button"
            onClick={() => {
              const remaining = total - doneCount;
              const ok = window.confirm(
                `Skip to the client dashboard?\n\n${remaining} onboarding task${
                  remaining === 1 ? "" : "s"
                } still open. You can come back to onboarding any time from the client's tabs.`,
              );
              if (ok) onComplete();
            }}
          >
            Skip to client dashboard →
          </button>
        </div>
      )}

      <style>{FORM_OVERLAY_CSS}</style>
    </div>
  );
}

function DoneCard({
  phase,
  completedAt,
  onSelect,
}: {
  phase: OnboardingPhase;
  completedAt: string | undefined;
  onSelect: () => void;
}) {
  const total = phaseTaskCount(phase);
  return (
    <button
      type="button"
      className="ob-card ob-done"
      onClick={onSelect}
      aria-label={`Open phase ${phase.num}: ${phase.name}`}
    >
      <div className="ob-check">✓</div>
      <div className="ob-phase-num">PHASE {String(phase.num).padStart(2, "0")}</div>
      <div className="ob-phase-name">{phase.name}</div>
      <div className="ob-done-meta">
        {total} OF {total} COMPLETE
        {completedAt && (
          <>
            <span className="ob-sep">·</span>
            {completedAt}
          </>
        )}
      </div>
    </button>
  );
}

function UpcomingCard({ phase, onSelect }: { phase: OnboardingPhase; onSelect: () => void }) {
  return (
    <button
      type="button"
      className="ob-card ob-upcoming"
      onClick={onSelect}
      aria-label={`Open phase ${phase.num}: ${phase.name}`}
    >
      <div className="ob-upcoming-ring">{String(phase.num).padStart(2, "0")}</div>
      <div className="ob-upcoming-body">
        <div className="ob-upcoming-head">
          <span className="ob-upcoming-num">PHASE {String(phase.num).padStart(2, "0")}</span>
          <span className="ob-upcoming-name">{phase.name}</span>
        </div>
        <div className="ob-upcoming-hint">{phase.hint}</div>
      </div>
      <div className="ob-upcoming-meta">{phase.meta}</div>
    </button>
  );
}

function ActiveCard({
  phase,
  doneSet,
  skippedSet,
  completed,
  onToggle,
  onToggleSkip,
  onOpenForm,
  canOpenForm,
  adsSubProgress,
  inlineDraft,
  inlineSaved,
  inlineStatus,
  onInlineChange,
  onInlineSave,
}: {
  phase: OnboardingPhase;
  doneSet: Set<string>;
  skippedSet: Set<string>;
  completed: number;
  onToggle: (id: string) => void;
  onToggleSkip: (id: string) => void;
  onOpenForm: (taskId: string) => void;
  canOpenForm: boolean;
  adsSubProgress: { done: number; total: number };
  inlineDraft: Record<string, string>;
  inlineSaved: Record<string, string>;
  inlineStatus: Record<string, "idle" | "saving" | "error">;
  onInlineChange: (taskId: string, value: string) => void;
  onInlineSave: (
    taskId: string,
    field: OnboardingInlineField,
    value: string,
  ) => void | Promise<void>;
}) {
  const total = phaseTaskCount(phase);
  return (
    <section className="ob-card ob-active">
      <div className="ob-active-head">
        <div className="ob-active-num">
          PHASE {String(phase.num).padStart(2, "0")} / {ONBOARDING_PLAN.length}
        </div>
        <div className="ob-active-title">
          <h2>
            <span dangerouslySetInnerHTML={{ __html: phase.name }} />
          </h2>
          <p className="ob-purpose">{phase.purpose}</p>
        </div>
        <div className="ob-active-stats">
          <div className="ob-pill">▸ ACTIVE</div>
          <div className="ob-count-ring">
            <em>{completed}</em> / {total} tasks
          </div>
        </div>
      </div>

      <div className="ob-active-body">
        {phase.subsections.map((ss) => {
          const ssDone = ss.tasks.filter((t) => doneSet.has(t.id)).length;
          return (
            <div className="ob-subsection" key={ss.id}>
              <div className="ob-sub-head">
                <span className="ob-sub-label">
                  <span className="ob-num">{ss.id}</span>
                  {ss.title}
                </span>
                <span className="ob-sub-meta">
                  {ss.meta ? `${ss.meta} · ` : ""}
                  {ssDone} / {ss.tasks.length}
                </span>
              </div>
              {ss.tasks.map((t) => {
                const step = STEP_BY_TASK.get(t.id);
                const standaloneFormForTask = !step ? FORM_BY_TASK.get(t.id) ?? null : null;
                const isMobileAppTask = t.id === PROVISION_MOBILE_APP_TASK_ID;
                const isAdsTask = t.id === ADS_MASTER_TASK_ID;
                const isCompetitorTask = t.id === COMPETITOR_RESEARCH_TASK_ID;
                let actionLabel: string | undefined;
                let actionHint: string | undefined;
                if (isAdsTask) {
                  actionLabel =
                    adsSubProgress.done > 0
                      ? `Resume sequence (${adsSubProgress.done}/${adsSubProgress.total}) →`
                      : "Open Ads sequence →";
                  actionHint = `${adsSubProgress.total} forms grouped Research / Creative / Launch. One at a time; finished ones tuck into the side rail.`;
                } else if (isMobileAppTask) {
                  actionLabel = "Open form";
                  actionHint = "Provision Supabase tenant + invite client.";
                } else if (isCompetitorTask) {
                  actionLabel = "Open chat";
                  actionHint = "Paste competitor reviews; the data analyst pulls the pain points.";
                } else if (standaloneFormForTask) {
                  actionLabel = "Open form";
                } else {
                  actionHint = step?.hint;
                }
                const subProgress = isAdsTask ? adsSubProgress : undefined;
                const inlineField = t.inlineField ?? null;
                return (
                  <TaskRow
                    key={t.id}
                    task={t}
                    checked={doneSet.has(t.id)}
                    skipped={skippedSet.has(t.id)}
                    step={step ?? null}
                    showActionButton={
                      Boolean(step) ||
                      isMobileAppTask ||
                      isAdsTask ||
                      isCompetitorTask ||
                      Boolean(standaloneFormForTask)
                    }
                    actionLabel={actionLabel}
                    actionHint={actionHint}
                    canOpenForm={canOpenForm}
                    subProgress={subProgress}
                    inlineField={inlineField}
                    inlineDraft={inlineDraft[t.id] ?? ""}
                    inlineSaved={inlineSaved[t.id] ?? ""}
                    inlineStatus={inlineStatus[t.id] ?? "idle"}
                    onInlineChange={(value) => onInlineChange(t.id, value)}
                    onInlineSave={() => {
                      if (!inlineField) return;
                      void onInlineSave(
                        t.id,
                        inlineField,
                        inlineDraft[t.id] ?? "",
                      );
                    }}
                    onToggle={() => onToggle(t.id)}
                    onToggleSkip={() => onToggleSkip(t.id)}
                    onOpenForm={() => onOpenForm(t.id)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TaskRow({
  task,
  checked,
  skipped,
  step,
  showActionButton,
  actionLabel,
  actionHint,
  canOpenForm,
  subProgress,
  inlineField,
  inlineDraft,
  inlineSaved,
  inlineStatus,
  onInlineChange,
  onInlineSave,
  onToggle,
  onToggleSkip,
  onOpenForm,
}: {
  task: OnboardingTask;
  checked: boolean;
  skipped: boolean;
  step: SequenceStep | null;
  showActionButton?: boolean;
  actionLabel?: string;
  actionHint?: string;
  canOpenForm: boolean;
  subProgress?: { done: number; total: number };
  inlineField?: OnboardingInlineField | null;
  inlineDraft?: string;
  inlineSaved?: string;
  inlineStatus?: "idle" | "saving" | "error";
  onInlineChange?: (value: string) => void;
  onInlineSave?: () => void;
  onToggle: () => void;
  onToggleSkip: () => void;
  onOpenForm: () => void;
}) {
  const shouldShowAction =
    (showActionButton ?? Boolean(step)) && canOpenForm && !skipped;
  const hint = actionHint ?? step?.hint;
  const label = actionLabel ?? "Open form";
  const howto = task.howto;
  const rowClass =
    "ob-task" +
    (checked ? " ob-complete" : "") +
    (skipped ? " ob-skipped" : "");
  return (
    <div className={rowClass}>
      <button
        type="button"
        className={"ob-check-box" + (checked ? " ob-checked" : "")}
        onClick={onToggle}
        disabled={skipped}
        aria-label={checked ? "Mark task incomplete" : "Mark task complete"}
      />
      <div className="ob-task-body">
        <span dangerouslySetInnerHTML={{ __html: task.label }} />
        {task.optional &&
          (skipped ? (
            <button
              type="button"
              className="ob-na-chip ob-na-chip-on"
              onClick={onToggleSkip}
              title="Restore this optional task"
            >
              N/A
              <span className="ob-na-x" aria-hidden="true">×</span>
            </button>
          ) : (
            <>
              <span className="ob-optional-chip">optional</span>
              <button
                type="button"
                className="ob-na-btn"
                onClick={onToggleSkip}
                title="Don't have this: cross it out"
              >
                N/A
              </button>
            </>
          ))}
        {subProgress && subProgress.total > 0 && (
          <span className="ob-subprogress">
            {subProgress.done} / {subProgress.total} sub-steps done
          </span>
        )}
        {howto && (
          <div className="ob-task-howto">
            <span className="ob-howto-label">▸ How to</span>
            {typeof howto === "string" ? (
              <span dangerouslySetInnerHTML={{ __html: howto }} />
            ) : (
              <ol>
                {howto.map((stepText, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: stepText }} />
                ))}
              </ol>
            )}
          </div>
        )}
        {inlineField && !skipped && (
          <InlineFieldEditor
            field={inlineField}
            draft={inlineDraft ?? ""}
            saved={inlineSaved ?? ""}
            status={inlineStatus ?? "idle"}
            disabled={!canOpenForm}
            onChange={(v) => onInlineChange?.(v)}
            onSave={() => onInlineSave?.()}
          />
        )}
      </div>
      {shouldShowAction && (
        <button
          type="button"
          className="ob-task-action"
          onClick={onOpenForm}
          title={hint}
        >
          {checked ? (
            <>
              Re-run
              <IconArrowRight size={10} />
            </>
          ) : (
            <>
              {label}
              <IconArrowRight size={10} />
            </>
          )}
        </button>
      )}
    </div>
  );
}

function InlineFieldEditor({
  field,
  draft,
  saved,
  status,
  disabled,
  onChange,
  onSave,
}: {
  field: OnboardingInlineField;
  draft: string;
  saved: string;
  status: "idle" | "saving" | "error";
  disabled: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const trimmedDraft = draft.trim();
  const isAppendOnly = field.kind === "memory-fathom";
  const isDirty = trimmedDraft !== saved.trim();
  const canSave =
    !disabled && status !== "saving" && trimmedDraft.length > 0 && isDirty;
  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && canSave) {
      e.preventDefault();
      onSave();
    }
  };
  return (
    <div className="ob-inline-field">
      <label className="ob-inline-label">{field.label}</label>
      <div className="ob-inline-row">
        <input
          type={field.inputType ?? "text"}
          className="ob-inline-input"
          value={draft}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled || status === "saving"}
          spellCheck={false}
        />
        <button
          type="button"
          className="ob-inline-save"
          onClick={onSave}
          disabled={!canSave}
          title={
            disabled
              ? "Pick a vault folder in Settings first"
              : isAppendOnly
                ? "Append to Memory.md"
                : "Write to Profile.md"
          }
        >
          {status === "saving" ? "Saving…" : isAppendOnly ? "Append" : "Save"}
        </button>
      </div>
      {status === "error" && (
        <span className="ob-inline-hint ob-inline-err">
          Save failed. Try again.
        </span>
      )}
      {status !== "error" && saved && !isAppendOnly && !isDirty && (
        <span className="ob-inline-hint">Saved to Profile.md</span>
      )}
      {status !== "error" && isAppendOnly && saved && !isDirty && (
        <span className="ob-inline-hint">Appended to Memory.md</span>
      )}
    </div>
  );
}

function GhlSyncPill({
  status,
  onRetry,
}: {
  status: GhlSyncStatus;
  onRetry: () => void;
}) {
  if (status.kind === "idle") return null;
  if (status.kind === "syncing") {
    return (
      <span className="ob-ghl-pill ob-ghl-syncing" title="Syncing to GoHighLevel">
        GHL · syncing P{status.phase}
      </span>
    );
  }
  if (status.kind === "ok") {
    return (
      <span className="ob-ghl-pill ob-ghl-ok" title="Synced to GoHighLevel">
        GHL · {status.stageName || `phase ${status.phase}`}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="ob-ghl-pill ob-ghl-err"
      onClick={onRetry}
      title={status.message}
    >
      GHL · sync failed · retry
    </button>
  );
}

// Inline styles for the form overlay + the per-task action button.
// Kept colocated so the unified checklist stays self-contained.
const FORM_OVERLAY_CSS = `
.ob-task {
  grid-template-columns: 22px 1fr auto;
}
.ob-task-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--hml-accent-dim);
  color: var(--hml-accent);
  border: 1px solid var(--hml-accent-border);
  border-radius: 6px;
  padding: 5px 10px;
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  margin-top: 1px;
  align-self: start;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.ob-task-action:hover {
  background: var(--hml-accent);
  color: var(--hml-bg-base);
  border-color: var(--hml-accent);
}
.ob-task.ob-complete .ob-task-action {
  background: transparent;
  color: var(--hml-text-tertiary);
  border-color: var(--hml-border);
}
.ob-task.ob-complete .ob-task-action:hover {
  color: var(--hml-text-primary);
  border-color: var(--hml-border-strong);
}

.ob-form-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  margin-bottom: 16px;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
}
.ob-form-back {
  background: transparent;
  border: 1px solid var(--hml-border);
  color: var(--hml-text-secondary);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s, color 0.15s;
}
.ob-form-back:hover {
  border-color: var(--hml-accent);
  color: var(--hml-accent);
}
.ob-form-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.ob-form-task {
  font-family: var(--hml-font-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--hml-text-primary);
}
.ob-form-hint {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--hml-accent);
  background: var(--hml-accent-dim);
  border: 1px solid var(--hml-accent-border);
  padding: 2px 8px;
  border-radius: 999px;
}

.ob-inline-field {
  margin-top: 8px;
  padding: 9px 12px 10px;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ob-inline-label {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  font-weight: 500;
}
.ob-inline-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.ob-inline-input {
  flex: 1;
  background: var(--hml-bg-base);
  border: 1px solid var(--hml-border);
  border-radius: 5px;
  padding: 6px 10px;
  font-family: var(--hml-font-sans);
  font-size: 13px;
  color: var(--hml-text-primary);
  outline: none;
  min-width: 0;
}
.ob-inline-input:focus {
  border-color: var(--hml-accent);
}
.ob-inline-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ob-inline-save {
  background: var(--hml-accent-dim);
  color: var(--hml-accent);
  border: 1px solid var(--hml-accent-border);
  border-radius: 5px;
  padding: 5px 12px;
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.ob-inline-save:hover:not(:disabled) {
  background: var(--hml-accent);
  color: var(--hml-bg-base);
  border-color: var(--hml-accent);
}
.ob-inline-save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ob-inline-hint {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
}
.ob-inline-err {
  color: #ff7676;
}
`;
