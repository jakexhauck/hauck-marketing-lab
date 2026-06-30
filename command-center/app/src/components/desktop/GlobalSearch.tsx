import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

// The search pill. Routes to the Leads board with the query prefilled (the Leads
// page reads ?q). No network: it is a typed jump to Leads. Two looks: the default
// topbar pill (hidden below xl) and the `sidebar` variant (full width, always
// visible) used in the sidebar footer where the global controls now live.
export default function GlobalSearch({ sidebar = false }: { sidebar?: boolean }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    navigate(`/leads?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className={
        sidebar
          ? "flex h-9 w-full items-center gap-2 rounded-full border border-border bg-surface-2 px-3.5 text-[13px] text-muted transition-colors focus-within:border-brand focus-within:bg-surface"
          : "hidden h-9 w-[280px] items-center gap-2 rounded-full border border-border bg-surface-2 px-3.5 text-[13px] text-muted transition-colors focus-within:border-brand focus-within:bg-surface xl:flex"
      }
    >
      <Search size={15} className="shrink-0 text-faint" />
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQ("");
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Search leads, contacts..."
        aria-label="Search"
        className="w-full bg-transparent text-text placeholder:text-faint focus:outline-none"
      />
    </form>
  );
}
