import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Lead, LeadActivity, LeadStage } from "../types";
import { getLeadsForClient } from "../mock";
import { useClient } from "./ClientContext";
import { useAuth } from "./AuthContext";
import { useLeadsQuery, usePipelineQuery, useUpdateLead } from "../hooks/useApi";
import { mapGhlStage } from "../lib/stageMap";
import type { ApiLead } from "../lib/api";

interface LeadsContextValue {
  leads: Lead[];
  getLead: (id: string) => Lead | undefined;
  markStage: (leadId: string, stage: LeadStage, value?: number) => void;
  advanceStage: (leadId: string, toStage: LeadStage) => void;
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

function adaptApiLead(
  a: ApiLead,
  pipelineStages: { id: string; name: string }[] | undefined,
  fallbackClientId: string,
): Lead {
  const stageName = pipelineStages?.find((s) => s.id === a.pipelineStageId)?.name;
  return {
    id: a.id,
    clientId: fallbackClientId,
    assignedUserId: null,
    name: a.name || "Unknown",
    phone: a.phone,
    email: a.email,
    sourceAd: "",
    sourceCampaign: "",
    stage: mapGhlStage(stageName, a.status),
    value: a.value,
    createdAt: a.createdAt,
    lastActivityAt: a.lastActivityAt,
    notes: a.notes,
  };
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
  if (lead.stage !== "new") {
    const lastMs = new Date(lead.lastActivityAt).getTime();
    out.push({
      id: `${lead.id}-seed-stage`,
      leadId: lead.id,
      kind: "stage-change",
      at: Number.isFinite(lastMs) ? lastMs : Date.now(),
      fromStage: "new",
      toStage: lead.stage,
    });
    if (lead.stage === "won" && typeof lead.value === "number") {
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

  const pipelineQuery = usePipelineQuery(useReal);
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
      adaptApiLead(a, pipelineQuery.data?.stages, client.id),
    );
  }, [useReal, leadsQuery.data, pipelineQuery.data?.stages, client.id]);

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

  const applyMockStage = useCallback(
    (leadId: string, stage: LeadStage, value?: number) => {
      const at = Date.now();
      const authorUserId = currentUser?.id;
      setMockLeads((prev) => {
        const target = prev.find((l) => l.id === leadId);
        if (!target) return prev;
        const fromStage = target.stage;
        const newEntries: LeadActivity[] = [];
        if (fromStage !== stage) {
          newEntries.push({
            id: newId(),
            leadId,
            kind: "stage-change",
            at,
            authorUserId,
            fromStage,
            toStage: stage,
          });
        }
        if (stage === "won" && typeof value === "number") {
          newEntries.push({
            id: newId(),
            leadId,
            kind: "won-recorded",
            at,
            authorUserId,
            value,
          });
        }
        appendActivities(newEntries);
        return prev.map((l) => {
          if (l.id !== leadId) return l;
          const nextValue =
            stage === "won" && typeof value === "number" ? value : l.value;
          return {
            ...l,
            stage,
            value: nextValue,
            lastActivityAt: new Date(at).toISOString(),
          };
        });
      });
    },
    [currentUser, appendActivities],
  );

  const markStage = useCallback(
    (leadId: string, stage: LeadStage, value?: number) => {
      const at = Date.now();
      const authorUserId = currentUser?.id;
      if (useReal) {
        appendActivities([
          {
            id: newId(),
            leadId,
            kind: "stage-change",
            at,
            authorUserId,
            fromStage: leads.find((l) => l.id === leadId)?.stage ?? "new",
            toStage: stage,
          },
          ...(stage === "won" && typeof value === "number"
            ? [
                {
                  id: newId(),
                  leadId,
                  kind: "won-recorded" as const,
                  at,
                  authorUserId,
                  value,
                },
              ]
            : []),
        ]);
        updateLead.mutate({
          leadId,
          appStage: stage,
          value: value ?? null,
          pipelineStages: pipelineQuery.data?.stages,
        });
      } else {
        applyMockStage(leadId, stage, value);
      }
    },
    [
      useReal,
      currentUser,
      leads,
      pipelineQuery.data?.stages,
      updateLead,
      appendActivities,
      applyMockStage,
    ],
  );

  const advanceStage = useCallback(
    (leadId: string, toStage: LeadStage) => {
      markStage(leadId, toStage);
    },
    [markStage],
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
      markStage,
      advanceStage,
      getActivitiesForLead,
      addNote,
      isLoading: useReal && (leadsQuery.isLoading || pipelineQuery.isLoading),
      error:
        (useReal &&
          ((leadsQuery.error as Error | null) ??
            (pipelineQuery.error as Error | null))) ||
        null,
    }),
    [
      leads,
      getLead,
      markStage,
      advanceStage,
      getActivitiesForLead,
      addNote,
      useReal,
      leadsQuery.isLoading,
      leadsQuery.error,
      pipelineQuery.isLoading,
      pipelineQuery.error,
    ],
  );

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error("useLeads must be used inside LeadsProvider");
  return ctx;
}
