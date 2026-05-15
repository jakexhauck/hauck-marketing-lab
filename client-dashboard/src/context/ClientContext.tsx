import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Client } from "../types";
import { clients, getClient } from "../mock";
import { applyBrandVars } from "../lib/applyBrandVars";

interface ClientContextValue {
  client: Client;
  setClient: (clientId: string) => void;
  allClients: Client[];
}

const ClientContext = createContext<ClientContextValue | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clientId, setClientId] = useState<string>("smiths-roofing");
  const client = useMemo(() => {
    const c = getClient(clientId);
    if (!c) throw new Error(`Unknown client ${clientId}`);
    return c;
  }, [clientId]);

  useEffect(() => {
    applyBrandVars(client.brand);
  }, [client]);

  const setClient = useCallback((id: string) => {
    setClientId(id);
  }, []);

  const value = useMemo(
    () => ({ client, setClient, allClients: clients }),
    [client, setClient]
  );

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient(): ClientContextValue {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClient must be used inside ClientProvider");
  return ctx;
}
