import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Search,
  CornerDownLeft,
  Sun,
  Moon,
  LogOut,
  User,
  GitBranch,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV, deepLink } from "@/lib/nav";
import { useContactsQuery, useLeadsQuery } from "@/hooks/useApi";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";

interface PaletteCtx {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}
const Ctx = createContext<PaletteCtx | null>(null);
export function usePalette(): PaletteCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePalette must be used within CommandPaletteProvider");
  return ctx;
}

interface Cmd {
  id: string;
  label: string;
  sub?: string;
  group: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const ctx = useMemo<PaletteCtx>(
    () => ({ open: () => setOpen(true), close: () => setOpen(false), isOpen }),
    [isOpen],
  );

  // Global ⌘K / Ctrl-K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {isOpen && <Palette onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Only pull data once the operator starts typing, to keep the palette instant.
  const hasQuery = query.trim().length > 0;
  const { data: contactsData } = useContactsQuery({ enabled: hasQuery });
  const { data: leadsData } = useLeadsQuery(undefined, { enabled: hasQuery });

  useEffect(() => inputRef.current?.focus(), []);

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const commands = useMemo<Cmd[]>(() => {
    const q = query.trim().toLowerCase();
    const list: Cmd[] = [];

    for (const item of NAV) {
      list.push({
        id: `nav:${item.to}`,
        label: item.label,
        sub: item.hint,
        group: "Go to",
        icon: <item.icon size={16} />,
        run: () => go(item.to),
      });
    }

    list.push(
      {
        id: "act:theme",
        label: theme === "light" ? "Switch to dark" : "Switch to light",
        group: "Actions",
        icon: theme === "light" ? <Moon size={16} /> : <Sun size={16} />,
        run: () => {
          toggleTheme();
          onClose();
        },
      },
      {
        id: "act:signout",
        label: "Sign out",
        group: "Actions",
        icon: <LogOut size={16} />,
        run: () => void signOut(),
      },
    );

    if (q) {
      for (const lead of leadsData?.leads ?? []) {
        if (!lead.name?.toLowerCase().includes(q)) continue;
        list.push({
          id: `lead:${lead.id}`,
          label: lead.name,
          sub: "Lead",
          group: "Leads",
          icon: <GitBranch size={16} className="text-brand-text" />,
          run: () => go(deepLink.lead(lead.id)),
        });
      }
      for (const c of contactsData?.contacts ?? []) {
        if (!c.name?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q)) continue;
        list.push({
          id: `contact:${c.id}`,
          label: c.name || c.email || "Unnamed",
          sub: c.email || c.phone || "Contact",
          group: "Contacts",
          icon: <User size={16} className="text-faint" />,
          run: () => go(deepLink.contact(c.id)),
        });
      }
    }

    if (!q) return list;
    return list.filter(
      (c) => c.label.toLowerCase().includes(q) || c.sub?.toLowerCase().includes(q),
    );
  }, [query, leadsData, contactsData, theme, toggleTheme, signOut]);

  // Clamp + reset active index when the result set changes.
  useEffect(() => setActive(0), [query]);
  const clampedActive = Math.min(active, Math.max(0, commands.length - 1));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, commands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commands[clampedActive]?.run();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  // Group while preserving order.
  const groups: { name: string; items: Cmd[] }[] = [];
  for (const cmd of commands) {
    let g = groups.find((x) => x.name === cmd.group);
    if (!g) {
      g = { name: cmd.group, items: [] };
      groups.push(g);
    }
    g.items.push(cmd);
  }

  let flatIndex = -1;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] animate-[overlayIn_.15s_ease-out]" aria-hidden />
      <div
        role="dialog"
        aria-modal
        className="relative w-full max-w-[560px] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-lg)] animate-[paletteIn_.16s_ease-out]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-divider px-4">
          <Search size={17} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search leads, contacts, or jump to a view…"
            className="h-13 flex-1 bg-transparent py-4 text-[15px] text-text placeholder:text-faint focus:outline-none"
          />
          <kbd className="font-data rounded border border-border px-1.5 py-0.5 text-[10px] text-faint">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {commands.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-faint">No matches.</div>
          ) : (
            groups.map((group) => (
              <div key={group.name} className="mb-1">
                <div className="label-cap px-4 pb-1 pt-2">{group.name}</div>
                {group.items.map((cmd) => {
                  flatIndex++;
                  const isActive = flatIndex === clampedActive;
                  const idx = flatIndex;
                  return (
                    <button
                      key={cmd.id}
                      onMouseEnter={() => setActive(idx)}
                      onClick={cmd.run}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                        isActive ? "bg-brand-tint" : "hover:bg-surface-2",
                      )}
                    >
                      <span className={cn("shrink-0", isActive ? "text-brand-text" : "text-muted")}>
                        {cmd.id.startsWith("contact:") ? <Avatar name={cmd.label} size="sm" /> : cmd.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-text">{cmd.label}</span>
                        {cmd.sub && <span className="block truncate text-xs text-faint">{cmd.sub}</span>}
                      </span>
                      {isActive && <CornerDownLeft size={14} className="shrink-0 text-faint" />}
                      {!isActive && cmd.group === "Go to" && (
                        <ArrowRight size={14} className="shrink-0 text-faint opacity-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
