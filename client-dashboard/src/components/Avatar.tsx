interface Props {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const AVATAR_PALETTE = [
  "#1e293b", // slate-800
  "#4f46e5", // indigo-600
  "#7c3aed", // violet-600
  "#e11d48", // rose-600
  "#d97706", // amber-600
  "#059669", // emerald-600
  "#0284c7", // sky-600
  "#c026d3", // fuchsia-600
  "#ea580c", // orange-600
  "#0d9488", // teal-600
];

const SIZE_MAP: Record<NonNullable<Props["size"]>, { box: string; text: string }> = {
  sm: { box: "h-8 w-8", text: "text-[11px]" },
  md: { box: "h-11 w-11", text: "text-sm" },
  lg: { box: "h-14 w-14", text: "text-lg" },
};

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name, size = "md", className }: Props) {
  const palette = AVATAR_PALETTE[hashName(name) % AVATAR_PALETTE.length];
  const { box, text } = SIZE_MAP[size];
  const initials = getInitials(name);
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl font-bold text-white font-display tabular-figs ${box} ${text} ${className ?? ""}`}
      style={{ backgroundColor: palette }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
