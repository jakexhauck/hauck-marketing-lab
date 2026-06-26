import type { LucideIcon } from "lucide-react";

// The admin "overview" hero: a single dark band with a green radial glow, the
// one place the brand goes bold on an otherwise calm neutral surface. Same dark
// treatment in light and dark mode (it is the contrast moment), with a soft
// floating orb that respects reduced-motion. Holds a greeting and a KPI row.

export interface HeroKpi {
  icon: LucideIcon;
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
}

export default function AdminHero({
  greeting,
  subtitle,
  kpis,
}: {
  greeting: string;
  subtitle: string;
  kpis: HeroKpi[];
}) {
  return (
    <section
      className="relative mb-7 overflow-hidden rounded-[var(--radius-xl)] px-8 py-7 text-white shadow-[var(--shadow-sm)]"
      style={{
        background:
          "radial-gradient(620px 280px at 88% -30%, rgba(124,115,240,0.34), transparent 70%), linear-gradient(160deg, #1a1840 0%, #0c0d1e 100%)",
      }}
    >
      <span className="admin-hero-orb pointer-events-none absolute -right-10 -top-16 h-60 w-60 rounded-full" aria-hidden />
      <h1 className="font-display text-[30px] font-semibold tracking-[-0.03em]">{greeting}</h1>
      <p className="mt-2 text-[14px] text-[#9fb0c8]">{subtitle}</p>

      <div className="mt-7 flex flex-wrap gap-x-9 gap-y-5">
        {kpis.map((k) => (
          <div key={k.label} className="min-w-[120px]">
            <div className="flex items-center gap-[7px] text-[12px] font-medium text-[#8a9cb6]">
              <k.icon size={14} className="text-brand" />
              {k.label}
            </div>
            <div className="mt-[7px] font-display text-[26px] font-semibold tracking-[-0.02em] tabular-nums">
              {k.value}
            </div>
            {k.delta && (
              <div className={`mt-1 text-[11.5px] ${k.deltaUp ? "text-[#5cd198]" : "text-[#7e90ab]"}`}>
                {k.delta}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
