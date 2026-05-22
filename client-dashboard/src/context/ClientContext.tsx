import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Client, Role } from "../types";
import { clients, getClient } from "../mock";
import { applyBrandVars } from "../lib/applyBrandVars";

interface ClientContextValue {
  client: Client;
  setClient: (clientId: string) => void;
  allClients: Client[];
  tenantId: string | null;
  role: Role;
}

const ClientContext = createContext<ClientContextValue | null>(null);

const FALLBACK_CLIENT: Client = clients[0];

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clientId, setClientId] = useState<string>(FALLBACK_CLIENT.id);

  const client = useMemo<Client>(
    () => getClient(clientId) ?? FALLBACK_CLIENT,
    [clientId],
  );

  useEffect(() => {
    applyBrandVars(client.brand);
  }, [client]);

  const setClient = useCallback((id: string) => {
    setClientId(id);
  }, []);

  const value = useMemo(
    () => ({
      client,
      setClient,
      allClients: clients,
      tenantId: null,
      role: "owner" as Role,
    }),
    [client, setClient],
  );

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient(): ClientContextValue {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClient must be used inside ClientProvider");
  return ctx;
}
