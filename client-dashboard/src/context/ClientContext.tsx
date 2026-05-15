import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Client } from "../types";
import { clients, getClient } from "../mock";

function applyBrandVars(client: Client) {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", client.brand.color);
  // simple tint: 10% opacity overlay handled via Tailwind; we still derive a dark variant
  root.style.setProperty("--brand-primary-dark", darken(client.brand.color, 0.15));
  root.style.setProperty("--brand-primary-tint", lighten(client.brand.color, 0.85));
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

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
    applyBrandVars(client);
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
