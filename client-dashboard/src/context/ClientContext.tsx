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
import { loadMyTenant } from "../lib/tenant";
import { useAuth } from "./AuthContext";

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
  const { session } = useAuth();
  const [clientId, setClientId] = useState<string>(FALLBACK_CLIENT.id);
  const [remoteClient, setRemoteClient] = useState<Client | null>(null);
  const [remoteRole, setRemoteRole] = useState<Role>("owner");
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setRemoteClient(null);
      setTenantId(null);
      return;
    }
    loadMyTenant().then((bundle) => {
      if (cancelled || !bundle) return;
      setRemoteClient(bundle.client);
      setRemoteRole(bundle.role);
      setTenantId(bundle.tenantId);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const client = useMemo<Client>(() => {
    if (remoteClient) return remoteClient;
    return getClient(clientId) ?? FALLBACK_CLIENT;
  }, [remoteClient, clientId]);

  useEffect(() => {
    applyBrandVars(client.brand);
  }, [client]);

  const setClient = useCallback((id: string) => {
    setRemoteClient(null);
    setClientId(id);
  }, []);

  const value = useMemo(
    () => ({
      client,
      setClient,
      allClients: clients,
      tenantId,
      role: remoteRole,
    }),
    [client, setClient, tenantId, remoteRole],
  );

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient(): ClientContextValue {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClient must be used inside ClientProvider");
  return ctx;
}
