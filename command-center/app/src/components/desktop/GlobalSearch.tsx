import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

// The kit topbar's search pill. Routes to the Leads board with the query
// prefilled (the Leads page reads ?q). Hidden below xl so narrow desktops keep
// the title and actions uncrowded. No network: it is a typed jump to Leads.
export default function GlobalSearch() {
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
      className="hidden h-9 w-[280px] items-center gap-2 rounded-full border border-border bg-surface-2 px-3.5 text-[13px] text-muted transition-colors focus-within:border-brand focus-within:bg-surface xl:flex"
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
        aria-label="Search leads"
        className="w-full bg-transparent text-text placeholder:text-faint focus:outline-none"
      />
    </form>
  );
}
