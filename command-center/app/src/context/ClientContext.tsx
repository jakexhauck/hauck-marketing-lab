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
import { clients as mockClients, getClient } from "../mock";
import { applyBrandVars } from "../lib/applyBrandVars";
import { APP_BRAND } from "../lib/appBrand";
import { useAuth } from "./AuthContext";
import { useTenantQuery } from "../hooks/useApi";
import type { ApiTenant } from "../lib/api";

interface ClientContextValue {
  client: Client;
  setClient: (clientId: string) => void;
  allClients: Client[];
  tenantId: string | null;
  role: Role;
}

const ClientContext = createContext<ClientContextValue | null>(null);

// What authenticated sessions see until (or unless) the tenant row loads.
// Branding constants only; no fabricated spend, generic labels.
const BRAND_FALLBACK_CLIENT: Client = {
  id: "tenant",
  name: APP_BRAND.appName,
  niche: "",
  brand: {
    color: APP_BRAND.color,
    logoUrl: null,
    initials: APP_BRAND.initials,
    appName: APP_BRAND.appName,
  },
  pipeline: { wonLabel: "Won", valueLabel: "Job Value" },
  tier: "core",
  monthlySpend: null,
  websiteUrl: null,
};

function clientFromTenant(t: ApiTenant): Client {
  return {
    id: "tenant",
    name: t.name,
    niche: t.niche,
    brand: {
      color: t.brandColor || APP_BRAND.color,
      logoUrl: null,
      initials: t.brandInitials || APP_BRAND.initials,
      appName: t.appName || APP_BRAND.appName,
    },
    pipeline: {
      wonLabel: t.wonLabel || "Won",
      valueLabel: t.valueLabel || "Job Value",
    },
    tier: "core",
    monthlySpend: t.monthlySpend,
    websiteUrl: t.websiteUrl ?? null,
  };
}

export function ClientProvider({ children }: { children: ReactNode }) {
  const { session, isAdmin } = useAuth();
  // Authenticated CLIENT sessions read real tenant config; mock clients exist
  // only for dev affordances (DevPanel switching, Showroom). A super-admin has
  // no tenant, so the tenant query is skipped (it would 500) and the admin area
  // renders its own chrome.
  const tenantQuery = useTenantQuery(Boolean(session) && !isAdmin);
  const [mockClientId, setMockClientId] = useState<string | null>(null);

  const client = useMemo<Client>(() => {
    // Dev-only: an explicit DevPanel/Showroom selection wins.
    if (import.meta.env.DEV && mockClientId) {
      return getClient(mockClientId) ?? BRAND_FALLBACK_CLIENT;
    }
    if (session) {
      const tenant = tenantQuery.data?.tenant;
      return tenant ? clientFromTenant(tenant) : BRAND_FALLBACK_CLIENT;
    }
    // Unauthenticated: dev builds keep the first mock client so Showroom and
    // local demos have data; prod shows the brand fallback (login screen).
    return import.meta.env.DEV ? mockClients[0] : BRAND_FALLBACK_CLIENT;
  }, [mockClientId, session, tenantQuery.data]);

  useEffect(() => {
    applyBrandVars(client.brand);
  }, [client]);

  const setClient = useCallback((id: string) => {
    if (!import.meta.env.DEV) return;
    setMockClientId(id);
  }, []);

  const value = useMemo(
    () => ({
      client,
      setClient,
      allClients: import.meta.env.DEV ? mockClients : [],
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
