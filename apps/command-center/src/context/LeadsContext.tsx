import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Lead, LeadActivity, LeadStatus } from "../types";
import { getLeadsForClient } from "../mock";
import { useClient } from "./ClientContext";
import { useAuth } from "./AuthContext";
import { usePipelines } from "./PipelinesContext";
import { useLeadsQuery, useUpdateLead } from "../hooks/useApi";
import type { ApiLead, ApiPipelineSummary } from "../lib/api";

interface LeadsContextValue {
  leads: Lead[];
  getLead: (id: string) => Lead | undefined;
  markWon: (leadId: string, value?: number) => void;
  markLost: (leadId: string) => void;
  moveStage: (leadId: string, stageId: string, stageName: string) => void;
  getActivitiesForLead: (leadId: string) => LeadActivity[];
  addNote: (leadId: string, body: string) => void;
  isLoading: boolean;
  error: Error | null;
}

const LeadsContext = createContext<LeadsContextValue | null>(null);

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function normalizeStatus(raw: string | undefined): LeadStatus {
  const s = (raw ?? "open").toLowerCase();
  if (s === "won" || s === "lost" || s === "abandoned") return s;
  return "open";
}

// Resolve a lead's display stage by looking up its (pipelineId,
// pipelineStageId) in the real pipelines list. A lead whose pipeline or stage
// no longer exists renders "Unknown stage" rather than crashing. Exported for
// LeadDetail's deep-link fallback (single-lead fetch when the list is cold).
export function adaptApiLead(
  a: ApiLead,
  pipelines: ApiPipelineSummary[],
  fallbackClientId: string,
): Lead {
  const pipeline = pipelines.find((p) => p.id === a.pipelineId);
  const stageIdx = pipeline
    ? pipeline.stages.findIndex((s) => s.id === a.pipelineStageId)
    : -1;
  return {
    id: a.id,
    clientId: fallbackClientId,
    assignedUserId: a.assignedUserId ?? null,
    contactId: a.contactId,
    name: a.name || "Unknown",
    phone: a.phone,
    email: a.email,
    // Real attribution from the contact's UTM custom fields (single-lead
    // endpoint only; empty on list-sourced leads until the detail fetch).
    sourceAd: a.attribution?.ad ?? "",
    sourceCampaign: a.attribution?.campaign ?? "",
    attribution: a.attribution ?? null,
    tags: a.tags,
    pipelineId: a.pipelineId,
    pipelineStageId: a.pipelineStageId,
    status: normalizeStatus(a.status),
    stageName: stageIdx >= 0 ? pipeline!.stages[stageIdx].name : "Unknown stage",
    stagePosition: stageIdx,
    pipelineName: pipeline?.name ?? "",
    value: a.value,
    createdAt: a.createdAt,
    lastActivityAt: a.lastActivityAt,
    // Lead-level notes are a mock-mode concept; real notes are contact notes
    // (NoteList via /api/contacts/{id}/notes).
    notes: null,
  };
}

function seedStageLabel(lead: Lead): string {
  if (lead.status === "won") return "Won";
  if (lead.status === "lost") return "Lost";
  if (lead.status === "abandoned") return "Abandoned";
  return lead.stageName;
}

function seedActivitiesForLead(lead: Lead): LeadActivity[] {
  const out: LeadActivity[] = [];
  const createdAtMs = new Date(lead.createdAt).getTime();
  out.push({
    id: `${lead.id}-seed-created`,
    leadId: lead.id,
    kind: "created",
    at: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
  });
  if (lead.status !== "open" || lead.stagePosition > 0) {
    const lastMs = new Date(lead.lastActivityAt).getTime();
    out.push({
      id: `${lead.id}-seed-stage`,
      leadId: lead.id,
      kind: "stage-change",
      at: Number.isFinite(lastMs) ? lastMs : Date.now(),
      toStage: seedStageLabel(lead),
    });
    if (lead.status === "won" && typeof lead.value === "number") {
      out.push({
        id: `${lead.id}-seed-won`,
        leadId: lead.id,
        kind: "won-recorded",
        at: Number.isFinite(lastMs) ? lastMs : Date.now(),
        value: lead.value,
      });
    }
  }
  return out;
}

function seedActivities(leads: Lead[]): LeadActivity[] {
  const all: LeadActivity[] = [];
  for (const l of leads) all.push(...seedActivitiesForLead(l));
  return all.sort((a, b) => b.at - a.at);
}

export function LeadsProvider({ children }: { children: ReactNode }) {
  const { client } = useClient();
  const { currentUser, session } = useAuth();
  const useReal = Boolean(session);

  const { pipelines, isLoading: pipelinesLoading, error: pipelinesError } =
    usePipelines();
  const leadsQuery = useLeadsQuery(useReal);
  const updateLead = useUpdateLead();

  const [mockLeads, setMockLeads] = useState<Lead[]>(() =>
    useReal ? [] : getLeadsForClient(client.id),
  );
  const [activities, setActivities] = useState<LeadActivity[]>(() =>
    useReal ? [] : seedActivities(getLeadsForClient(client.id)),
  );

  useEffect(() => {
    if (useReal) return;
    const next = getLeadsForClient(client.id);
    setMockLeads(next);
    setActivities(seedActivities(next));
  }, [client.id, useReal]);

  const realLeads = useMemo<Lead[]>(() => {
    if (!useReal || !leadsQuery.data) return [];
    return leadsQuery.data.leads.map((a) =>
      adaptApiLead(a, pipelines, client.id),
    );
  }, [useReal, leadsQuery.data, pipelines, client.id]);

  useEffect(() => {
    if (!useReal || realLeads.length === 0) return;
    setActivities((prev) => {
      const seeded = seedActivities(realLeads);
      const localOnly = prev.filter((a) => !a.id.endsWith("-seed-created") && !a.id.endsWith("-seed-stage") && !a.id.endsWith("-seed-won"));
      return [...localOnly, ...seeded].sort((a, b) => b.at - a.at);
    });
  }, [useReal, realLeads]);

  const leads = useReal ? realLeads : mockLeads;

  const appendActivities = useCallback((entries: LeadActivity[]) => {
    if (entries.length === 0) return;
    setActivities((a) => [...entries, ...a].sort((x, y) => y.at - x.at));
  }, []);

  const getLead = useCallback(
    (id: string) => leads.find((l) => l.id === id),
    [leads],
  );

  const recordOutcome = useCallback(
    (lead: Lead, toLabel: string, value?: number) => {
      const at = Date.now();
      const authorUserId = currentUser?.id;
      const entries: LeadActivity[] = [
        {
          id: newId(),
          leadId: lead.id,
          kind: "stage-change",
          at,
          authorUserId,
          fromStage: seedStageLabel(lead),
          toStage: toLabel,
        },
      ];
      if (typeof value === "number") {
        entries.push({
          id: newId(),
          leadId: lead.id,
          kind: "won-recorded",
          at,
          authorUserId,
          value,
        });
      }
      appendActivities(entries);
      return at;
    },
    [currentUser, appendActivities],
  );

  const applyMockUpdate = useCallback(
    (leadId: string, at: number, patch: Partial<Lead>) => {
      setMockLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, ...patch, lastActivityAt: new Date(at).toISOString() }
            : l,
        ),
      );
    },
    [],
  );

  const markWon = useCallback(
    (leadId: string, value?: number) => {
      const lead = getLead(leadId);
      if (!lead) return;
      const at = recordOutcome(lead, "Won", value);
      if (useReal) {
        updateLead.mutate({ leadId, status: "won", value: value ?? null });
      } else {
        applyMockUpdate(leadId, at, {
          status: "won",
          value: typeof value === "number" ? value : lead.value,
        });
      }
    },
    [useReal, getLead, recordOutcome, updateLead, applyMockUpdate],
  );

  const markLost = useCallback(
    (leadId: string) => {
      const lead = getLead(leadId);
      if (!lead) return;
      const at = recordOutcome(lead, "Lost");
      if (useReal) {
        updateLead.mutate({ leadId, status: "lost" });
      } else {
        applyMockUpdate(leadId, at, { status: "lost" });
      }
    },
    [useReal, getLead, recordOutcome, updateLead, applyMockUpdate],
  );

  const moveStage = useCallback(
    (leadId: string, stageId: string, stageName: string) => {
      const lead = getLead(leadId);
      if (!lead || lead.pipelineStageId === stageId) return;
      const at = recordOutcome(lead, stageName);
      if (useReal) {
        updateLead.mutate({ leadId, pipelineStageId: stageId });
      } else {
        const pipeline = pipelines.find((p) => p.id === lead.pipelineId);
        const idx = pipeline
          ? pipeline.stages.findIndex((s) => s.id === stageId)
          : -1;
        applyMockUpdate(leadId, at, {
          pipelineStageId: stageId,
          stageName,
          stagePosition: idx,
        });
      }
    },
    [useReal, getLead, recordOutcome, updateLead, applyMockUpdate, pipelines],
  );

  const addNote = useCallback(
    (leadId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      const at = Date.now();
      appendActivities([
        {
          id: newId(),
          leadId,
          kind: "note",
          at,
          authorUserId: currentUser?.id,
          body: trimmed,
        },
      ]);
      if (useReal) {
        updateLead.mutate({ leadId, notes: trimmed });
      } else {
        setMockLeads((prev) =>
          prev.map((l) =>
            l.id === leadId
              ? { ...l, lastActivityAt: new Date(at).toISOString() }
              : l,
          ),
        );
      }
    },
    [useReal, currentUser, appendActivities, updateLead],
  );

  const getActivitiesForLead = useCallback(
    (leadId: string) =>
      activities
        .filter((a) => a.leadId === leadId)
        .sort((a, b) => b.at - a.at),
    [activities],
  );

  const value = useMemo(
    () => ({
      leads,
      getLead,
      markWon,
      markLost,
      moveStage,
      getActivitiesForLead,
      addNote,
      isLoading: useReal && (leadsQuery.isLoading || pipelinesLoading),
      error:
        (useReal &&
          ((leadsQuery.error as Error | null) ?? pipelinesError)) ||
        null,
    }),
    [
      leads,
      getLead,
      markWon,
      markLost,
      moveStage,
      getActivitiesForLead,
      addNote,
      useReal,
      leadsQuery.isLoading,
      leadsQuery.error,
      pipelinesLoading,
      pipelinesError,
    ],
  );

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error("useLeads must be used inside LeadsProvider");
  return ctx;
}
