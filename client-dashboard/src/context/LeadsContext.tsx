import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lead, LeadStage } from "../types";
import { getLeadsForClient } from "../mock";
import { useClient } from "./ClientContext";

interface LeadsContextValue {
  leads: Lead[];
  getLead: (id: string) => Lead | undefined;
  markStage: (leadId: string, stage: LeadStage, value?: number) => void;
}

const LeadsContext = createContext<LeadsContextValue | null>(null);

export function LeadsProvider({ children }: { children: ReactNode }) {
  const { client } = useClient();
  const [leads, setLeads] = useState<Lead[]>(() => getLeadsForClient(client.id));

  useEffect(() => {
    setLeads(getLeadsForClient(client.id));
  }, [client.id]);

  const getLead = useCallback(
    (id: string) => leads.find((l) => l.id === id),
    [leads]
  );

  const markStage = useCallback(
    (leadId: string, stage: LeadStage, value?: number) => {
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          const nextValue = stage === "won" && typeof value === "number" ? value : l.value;
          return {
            ...l,
            stage,
            value: nextValue,
            lastActivityAt: new Date().toISOString(),
          };
        })
      );
    },
    []
  );

  const value = useMemo(
    () => ({ leads, getLead, markStage }),
    [leads, getLead, markStage]
  );

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error("useLeads must be used inside LeadsProvider");
  return ctx;
}
