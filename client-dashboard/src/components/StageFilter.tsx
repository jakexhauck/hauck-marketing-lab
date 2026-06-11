import clsx from "clsx";

export interface StageFilterOption {
  id: string;
  label: string;
  count: number;
}

interface Props {
  options: StageFilterOption[];
  active: string;
  onChange: (id: string) => void;
}

// Chip strip over the real stages of the selected pipeline (plus any
// status chips the caller appends). Purely presentational; the caller owns
// the option list and counts.
export default function StageFilter({ options, active, onChange }: Props) {
  return (
    <div
      className="no-scrollbar flex gap-2 overflow-x-auto bg-[var(--bg)] px-5 pb-3 pt-1"
      style={{ scrollbarWidth: "none" }}
    >
      {options.map((opt) => {
        const isActive = opt.id === active;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={clsx(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors active:scale-[0.97]",
              isActive
                ? "text-white"
                : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]"
            )}
            style={
              isActive
                ? { backgroundColor: "var(--brand-primary)" }
                : undefined
            }
          >
            <span>{opt.label}</span>
            <span
              className={clsx(
                "tabular-figs font-bold",
                isActive ? "text-white/80" : "text-[var(--text-faint)]"
              )}
            >
              {opt.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
