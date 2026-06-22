import { Badge } from "../ui/Badge";
import type { ChatRole } from "../../lib/api";

// A cosmetic role pill colored by role.color. Reuses the Badge shell for shape and
// type; the color is per-role hex so we tint inline instead of using a tone class.
export default function RoleBadge({
  role,
  className,
}: {
  role: ChatRole;
  className?: string;
}) {
  return (
    <Badge
      tone="neutral"
      className={className}
    >
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
        style={{
          color: role.color,
          background: `color-mix(in srgb, ${role.color} 16%, transparent)`,
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: role.color }}
          aria-hidden
        />
        {role.name}
      </span>
    </Badge>
  );
}
