// Shared rendering shell for status pills (invoice states, appointment
// states). Each screen owns its status-to-style map; this owns the look.
export interface StatusStyle {
  bg: string;
  fg: string;
  label: string;
}

export default function StatusBadge({ bg, fg, label }: StatusStyle) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}
