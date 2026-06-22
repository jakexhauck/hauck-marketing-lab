import { useEffect, useState } from "react";

// Dev-only control for comparing motion-intensity presets live. Motion can't
// be judged from a static screenshot, so this lets a reviewer flip between
// Calm / Balanced / Lively and watch the route + list animations replay.
// Stripped from production builds: the whole module is guarded by
// `import.meta.env.DEV` at the mount site, so it tree-shakes out of `vite build`.

type Preset = "calm" | "balanced" | "lively";
const PRESETS: Preset[] = ["calm", "balanced", "lively"];
const KEY = "hcc.motionPreset";

function apply(preset: Preset) {
  // "balanced" is the token default (no attribute), so clear it for that one.
  if (preset === "balanced") {
    document.documentElement.removeAttribute("data-motion");
  } else {
    document.documentElement.setAttribute("data-motion", preset);
  }
}

export default function MotionPresetSwitcher() {
  const [preset, setPreset] = useState<Preset>(() => {
    const saved = localStorage.getItem(KEY) as Preset | null;
    return saved && PRESETS.includes(saved) ? saved : "calm";
  });

  useEffect(() => {
    apply(preset);
    localStorage.setItem(KEY, preset);
  }, [preset]);

  return (
    <div
      className="fixed bottom-3 right-3 z-[9999] flex items-center gap-1 rounded-full border border-border bg-surface/90 p-1 shadow-[var(--shadow-md)] backdrop-blur"
      style={{ fontFamily: "var(--font-body)" }}
      aria-label="Motion preset (dev only)"
    >
      <span className="label-cap px-2 text-[9px]">Motion</span>
      {PRESETS.map((p) => {
        const active = p === preset;
        return (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            className={
              "rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors " +
              (active
                ? "bg-brand-tint text-brand-text"
                : "text-muted hover:text-text")
            }
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}
