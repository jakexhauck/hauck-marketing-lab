import { Search, X } from "lucide-react";
import { useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onClear?: () => void;
  placeholder?: string;
}

export default function SearchBar({
  value,
  onChange,
  onClear,
  placeholder = "Search leads",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onChange("");
    onClear?.();
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex w-full items-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 flex items-center text-[var(--text-faint)]"
      >
        <Search size={18} />
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-10 pr-12 text-[15px] font-medium text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none transition-colors focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20"
        style={{ minHeight: "44px" }}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-0.5 flex h-11 w-11 items-center justify-center text-[var(--text-muted)]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] active:scale-[0.94]">
            <X size={16} />
          </span>
        </button>
      )}
    </div>
  );
}
