import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// The client "overview" hero: a single dark band with a glow in the live client
// brand color, the one place the brand goes bold on an otherwise calm neutral
// surface. The base stays a fixed deep slate in light and dark mode (it is the
// contrast moment, and keeps white text legible for any brand color), with the
// brand driving the glow and KPI icon accents. Holds a greeting and a KPI row.
// The client-side sibling of the admin's AdminHero.

export interface ClientHeroKpi {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}

export default function ClientHero({
  greeting,
  subtitle,
  kpis,
}: {
  greeting: string;
  subtitle: string;
  kpis: ClientHeroKpi[];
}) {
  return (
    <section
      className="relative mb-7 overflow-hidden rounded-[var(--radius-xl)] px-8 py-7 text-white shadow-[var(--shadow-sm)]"
      style={{
        background:
          "radial-gradient(620px 280px at 88% -30%, color-mix(in srgb, var(--brand) 38%, transparent), transparent 70%), linear-gradient(160deg, #1a1840 0%, #0c0d1e 100%)",
      }}
    >
      <span className="client-hero-orb pointer-events-none absolute -right-10 -top-16 h-60 w-60 rounded-full" aria-hidden />
      <h1 className="font-display text-[30px] font-semibold tracking-[-0.03em]">{greeting}</h1>
      <p className="mt-2 text-[14px] text-[#9fb0c8]">{subtitle}</p>

      <div className="mt-7 flex flex-wrap gap-x-9 gap-y-5">
        {kpis.map((k) => (
          <div key={k.label} className="min-w-[120px]">
            <div className="flex items-center gap-[7px] text-[12px] font-medium text-[#8a9cb6]">
              <k.icon size={14} style={{ color: "var(--brand)" }} />
              {k.label}
            </div>
            <div className="mt-[7px] font-display text-[26px] font-semibold tracking-[-0.02em] tabular-nums">
              {k.value}
            </div>
            {k.sub && <div className="mt-1 text-[11.5px] text-[#7e90ab]">{k.sub}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
