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

interface LeadsContextValue {
  leads: Lead[];
  getLead: (id: string) => Lead | undefined;
  markStage: (leadId: string, stage: LeadStage, value?: number) => void;
  advanceStage: (leadId: string, toStage: LeadStage) => void;
  getActivitiesForLead: (leadId: string) => LeadActivity[];
  addNote: (leadId: string, body: string) => void;
}

const LeadsContext = createContext<LeadsContextValue | null>(null);

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
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
  const { currentUser } = useAuth();
  const [leads, setLeads] = useState<Lead[]>(() => getLeadsForClient(client.id));
  const [activities, setActivities] = useState<LeadActivity[]>(() =>
    seedActivities(getLeadsForClient(client.id))
  );

  useEffect(() => {
    const next = getLeadsForClient(client.id);
    setLeads(next);
    setActivities(seedActivities(next));
  }, [client.id]);

  const getLead = useCallback(
    (id: string) => leads.find((l) => l.id === id),
    [leads]
  );

  const appendActivities = useCallback((entries: LeadActivity[]) => {
    if (entries.length === 0) return;
    setActivities((a) => [...entries, ...a].sort((x, y) => y.at - x.at));
  }, []);

  const markStage = useCallback(
    (leadId: string, stage: LeadStage, value?: number) => {
      const at = Date.now();
      const authorUserId = currentUser?.id;
      setLeads((prev) => {
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
    [currentUser, appendActivities]
  );

  const advanceStage = useCallback(
    (leadId: string, toStage: LeadStage) => {
      const at = Date.now();
      const authorUserId = currentUser?.id;
      setLeads((prev) => {
        const target = prev.find((l) => l.id === leadId);
        if (!target) return prev;
        const fromStage = target.stage;
        if (fromStage !== toStage) {
          appendActivities([
            {
              id: newId(),
              leadId,
              kind: "stage-change",
              at,
              authorUserId,
              fromStage,
              toStage,
            },
          ]);
        }
        return prev.map((l) =>
          l.id === leadId
            ? { ...l, stage: toStage, lastActivityAt: new Date(at).toISOString() }
            : l
        );
      });
    },
    [currentUser, appendActivities]
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
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, lastActivityAt: new Date(at).toISOString() }
            : l
        )
      );
    },
    [currentUser, appendActivities]
  );

  const getActivitiesForLead = useCallback(
    (leadId: string) =>
      activities
        .filter((a) => a.leadId === leadId)
        .sort((a, b) => b.at - a.at),
    [activities]
  );

  const value = useMemo(
    () => ({
      leads,
      getLead,
      markStage,
      advanceStage,
      getActivitiesForLead,
      addNote,
    }),
    [leads, getLead, markStage, advanceStage, getActivitiesForLead, addNote]
  );

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error("useLeads must be used inside LeadsProvider");
  return ctx;
}
