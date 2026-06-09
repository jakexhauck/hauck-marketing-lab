import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { ApiPipelineSummary } from "../lib/api";

interface Props {
  pipelines: ApiPipelineSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  countsById?: Record<string, number>;
  // "onDark" renders the trigger as plain white text for the navy hero header.
  variant?: "default" | "onDark";
}

// Shorten "Database Reactivation Pipeline" -> "Database Reactivation" for the
// header. GHL names all end in "Pipeline"; drop the redundant suffix.
function shortName(name: string): string {
  return name.replace(/\s+Pipeline$/i, "").trim();
}

export default function PipelineSwitcher({
  pipelines,
  selectedId,
  onSelect,
  countsById,
  variant = "default",
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = pipelines.find((p) => p.id === selectedId) ?? null;
  const onDark = variant === "onDark";

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          "flex max-w-full items-center gap-1.5 active:scale-[0.98]" +
          (onDark ? "" : " rounded-xl bg-[var(--surface-2)] px-3 py-1.5")
        }
      >
        {onDark && (
          <span className="shrink-0 text-[13px] font-medium text-white/60">
            Pipeline
          </span>
        )}
        <span
          className={
            "truncate font-display text-[17px] font-bold tracking-tight " +
            (onDark ? "text-white" : "text-[var(--text)]")
          }
        >
          {selected ? shortName(selected.name) : "Pipeline"}
        </span>
        <ChevronDown
          size={18}
          className={"shrink-0 " + (onDark ? "text-white/80" : "text-[var(--text-muted)]")}
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close pipeline menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default bg-black/20"
          />
          <div
            role="listbox"
            className="absolute left-0 top-[calc(100%+8px)] z-40 w-[260px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl"
          >
            <div className="label-cap px-4 pb-1 pt-3">Switch pipeline</div>
            {pipelines.map((p) => {
              const isSel = p.id === selectedId;
              const count = countsById?.[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onClick={() => {
                    onSelect(p.id);
                    setOpen(false);
                  }}
                  className={
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-2)]" +
                    (isSel ? " bg-[var(--brand-primary-tint)]" : "")
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className={
                        "truncate text-[15px] " +
                        (isSel
                          ? "font-bold text-[var(--brand-primary)]"
                          : "font-semibold text-[var(--text)]")
                      }
                    >
                      {shortName(p.name)}
                    </div>
                    {typeof count === "number" && (
                      <div className="mt-0.5 text-xs text-[var(--text-faint)]">
                        {count} open
                      </div>
                    )}
                  </div>
                  {isSel && (
                    <Check
                      size={18}
                      className="shrink-0 text-[var(--brand-primary)]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
