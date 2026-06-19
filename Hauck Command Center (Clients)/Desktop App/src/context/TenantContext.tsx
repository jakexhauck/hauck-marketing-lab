import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useTenantQuery } from "@/hooks/useApi";
import { useAuth } from "./AuthContext";

// Fallback brand mirrors the Mobile App's src/lib/appBrand.ts so the Command
// Center looks right before /api/tenant resolves (or when Supabase is unconfigured).
const FALLBACK = {
  appName: "Hauck Command Center",
  niche: "",
  initials: "HM",
  brandColor: "#1a4d8f",
  wonLabel: "Won",
  valueLabel: "Value",
  monthlySpend: null as number | null,
};

export interface TenantBrand {
  appName: string;
  niche: string;
  initials: string;
  brandColor: string;
  wonLabel: string;
  valueLabel: string;
  monthlySpend: number | null;
  loading: boolean;
}

const Ctx = createContext<TenantBrand>({ ...FALLBACK, loading: true });

export function TenantProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  // Only resolve tenant branding once signed in; the login screen uses fallback.
  const { data, isLoading } = useTenantQuery({ enabled: status === "authenticated" });
  const t = data?.tenant;

  const brand = useMemo<TenantBrand>(
    () => ({
      appName: t?.appName || FALLBACK.appName,
      niche: t?.niche || FALLBACK.niche,
      initials: t?.brandInitials || FALLBACK.initials,
      brandColor: t?.brandColor || FALLBACK.brandColor,
      wonLabel: t?.wonLabel || FALLBACK.wonLabel,
      valueLabel: t?.valueLabel || FALLBACK.valueLabel,
      monthlySpend: t?.monthlySpend ?? FALLBACK.monthlySpend,
      loading: isLoading,
    }),
    [t, isLoading],
  );

  // Push the tenant's brand color into the live CSS variable so the whole
  // cockpit recolors. --brand-strong/tint derive from it via color-mix.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand", brand.brandColor);
    root.style.setProperty(
      "--brand-strong",
      `color-mix(in srgb, ${brand.brandColor} 80%, black)`,
    );
    document.title = brand.appName;
  }, [brand.brandColor, brand.appName]);

  return <Ctx.Provider value={brand}>{children}</Ctx.Provider>;
}

export function useTenant(): TenantBrand {
  return useContext(Ctx);
}
