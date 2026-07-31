import { useEffect, useMemo, useRef, useState } from "react";
import { ArchiveRestore, ChevronDown, ChevronUp, Plus, Trash2, Undo2 } from "lucide-react";
import {
  useCreatePlaybookItem,
  useDeletePlaybookItem,
  useSalesPlaybookQuery,
  useUpdatePlaybookItem,
} from "../../../hooks/useSalesPlaybook";
import {
  PLAYBOOK_SECTIONS,
  itemsForSection,
  swapTargets,
  type PlaybookItem,
  type PlaybookSectionDef,
  type PlaybookSectionId,
} from "../../../../functions/lib/salesPlaybook";

// Sales > Playbook.
//
// Where the three columns of On Call are written. Same three sections, same
// order, so editing the call looks like the call: a change made here is what
// Jake reads on the phone tomorrow, and a page that arranged them differently
// would make him translate between two layouts to check his own work.
//
// Everything saves on blur rather than behind a Save button. Rewording a
// question is a one-word edit made twenty times in a sitting, and a button per
// edit would be twenty clicks whose only job is to say "yes, I meant that".
//
// Retiring is offered before deleting. A question pulled after a month is worth
// being able to look at; a question added thirty seconds ago by mistake is not,
// which is what the delete on a retired row is for.

export default function PlaybookSection() {
  const [showRetired, setShowRetired] = useState(false);
  const query = useSalesPlaybookQuery(true);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const retiredCount = items.filter((i) => i.archivedAt).length;

  if (query.isLoading) return <div className="pk-empty">Reading the playbook...</div>;
  if (query.isError) {
    return <div className="pk-empty">Could not load the playbook. Reload to try again.</div>;
  }

  return (
    <div>
      <p className="mb-4 max-w-[74ch] text-[13px] leading-relaxed text-muted">
        What you work through on a sales call. These three columns are what On Call draws, in this
        order. Edits save as you leave a box and are live on the next call.
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PLAYBOOK_SECTIONS.map((section) => (
          <SectionEditor
            key={section.id}
            section={section}
            items={itemsForSection(items, section.id)}
          />
        ))}
      </div>

      {(retiredCount > 0 || showRetired) && (
        <div className="mt-5">
          <button type="button" className="pk-link" onClick={() => setShowRetired((v) => !v)}>
            {showRetired
              ? "Hide retired prompts"
              : `Show retired prompts (${retiredCount})`}
          </button>
          {showRetired && (
            <RetiredList items={items.filter((i) => i.archivedAt)} />
          )}
        </div>
      )}
    </div>
  );
}

// ===== One column =====

function SectionEditor({
  section,
  items,
}: {
  section: PlaybookSectionDef;
  items: PlaybookItem[];
}) {
  const create = useCreatePlaybookItem();
  const update = useUpdatePlaybookItem();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const prompt = draft.trim();
    if (!prompt) return;
    try {
      await create.mutateAsync({ section: section.id, prompt });
      setDraft("");
      setError(null);
      // The box stays open: adding one question is almost always adding three.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that");
    }
  };

  // Reordering swaps two rows' sort_order rather than renumbering the column.
  // Two writes instead of n, and a failure halfway leaves an order that is odd
  // rather than an order that is wrong.
  const move = async (id: string, direction: -1 | 1) => {
    const pair = swapTargets(items, id, direction);
    if (!pair) return;
    try {
      await update.mutateAsync({ id: pair.a.id, sortOrder: pair.b.sortOrder });
      await update.mutateAsync({ id: pair.b.id, sortOrder: pair.a.sortOrder });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder that");
    }
  };

  return (
    <section className="pk-card !p-0">
      <header className="border-b border-[var(--divider)] px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            {section.label}
          </h2>
          <span className="text-[12px] font-semibold tabular-nums text-faint">{items.length}</span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-snug text-faint">{section.blurb}</p>
      </header>

      <div className="px-5 py-2">
        {items.length === 0 && !adding && (
          <p className="py-4 text-[12.5px] text-faint">
            Nothing here yet. This column will be empty on the call.
          </p>
        )}

        {items.map((item, index) => (
          <ItemEditor
            key={item.id}
            item={item}
            placeholder={section.placeholder}
            canMoveUp={index > 0}
            canMoveDown={index < items.length - 1}
            onMove={(direction) => void move(item.id, direction)}
          />
        ))}
      </div>

      <footer className="border-t border-[var(--divider)] px-5 py-3">
        {adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              className="pk-input !text-[13px]"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                section.id === "objections" ? "What they say back" : "The prompt itself"
              }
              aria-label={`New ${section.label} prompt`}
              autoFocus
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="submit"
                className="pk-btn-save !px-4 !py-1.5 !text-[12.5px]"
                disabled={!draft.trim() || create.isPending}
              >
                {create.isPending ? "Adding..." : "Add"}
              </button>
              <button
                type="button"
                className="pk-btn-cancel !px-3 !py-1.5 !text-[12.5px]"
                onClick={() => {
                  setAdding(false);
                  setDraft("");
                }}
              >
                Done
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="pk-link" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden />
            Add a prompt
          </button>
        )}

        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
      </footer>
    </section>
  );
}

// ===== One prompt =====

// Saves on blur, and only when the text actually changed. The comparison is
// against what the server last returned rather than against a mount-time
// snapshot, so tabbing through a column without typing sends nothing at all.
function ItemEditor({
  item,
  placeholder,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  item: PlaybookItem;
  placeholder: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const update = useUpdatePlaybookItem();
  const remove = useDeletePlaybookItem();

  const [prompt, setPrompt] = useState(item.prompt);
  const [hint, setHint] = useState(item.hint);
  const [error, setError] = useState<string | null>(null);

  // A reorder refetches the list, which re-renders this row with the same text.
  // Without this, a row whose sort order moved would snap its boxes back to
  // whatever they held when it mounted.
  const serverPrompt = useRef(item.prompt);
  const serverHint = useRef(item.hint);
  useEffect(() => {
    if (item.prompt !== serverPrompt.current) {
      serverPrompt.current = item.prompt;
      setPrompt(item.prompt);
    }
    if (item.hint !== serverHint.current) {
      serverHint.current = item.hint;
      setHint(item.hint);
    }
  }, [item.prompt, item.hint]);

  const save = async (patch: { prompt?: string; hint?: string; archived?: boolean }) => {
    try {
      const res = await update.mutateAsync({ id: item.id, ...patch });
      serverPrompt.current = res.item.prompt;
      serverHint.current = res.item.hint;
      // The server tidies what it stores (whitespace, length), so the boxes show
      // what was actually saved rather than what was typed at it.
      setPrompt(res.item.prompt);
      setHint(res.item.hint);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
    }
  };

  // An emptied prompt is a row Jake is deleting by clearing it, which the
  // endpoint refuses. Put the last saved text back rather than leaving a blank
  // box that quietly is not stored.
  const savePrompt = () => {
    const next = prompt.trim();
    if (!next) {
      setPrompt(serverPrompt.current);
      setError(null);
      return;
    }
    if (next === serverPrompt.current) return;
    void save({ prompt: next });
  };

  const saveHint = () => {
    const next = hint.trim();
    if (next === serverHint.current) return;
    void save({ hint: next });
  };

  return (
    <div className="border-b border-[var(--divider)] py-3 last:border-b-0">
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <input
            className="pk-input !py-1.5 !text-[13px] !font-medium"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={savePrompt}
            aria-label="Prompt"
          />
          <input
            className="pk-input !mt-1.5 !py-1.5 !text-[11.5px]"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            onBlur={saveHint}
            placeholder="The small grey line under it. Optional."
            aria-label="Hint"
          />
          <p className="mt-1.5 text-[11px] text-faint">
            On the call: <span className="italic">{placeholder}</span>
          </p>
        </div>

        {/* Up, down, retire. A stack rather than a row so a narrow column keeps
            the text full width. */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <IconButton
            label="Move up"
            disabled={!canMoveUp || update.isPending}
            onClick={() => onMove(-1)}
          >
            <ChevronUp size={14} aria-hidden />
          </IconButton>
          <IconButton
            label="Move down"
            disabled={!canMoveDown || update.isPending}
            onClick={() => onMove(1)}
          >
            <ChevronDown size={14} aria-hidden />
          </IconButton>
          {/* Anything half-typed above is already saved by the time this fires:
              the mousedown blurs the box, and blur is what saves. */}
          <IconButton
            label="Retire this prompt"
            disabled={update.isPending || remove.isPending}
            onClick={() => void save({ archived: true })}
          >
            <Undo2 size={14} aria-hidden />
          </IconButton>
        </div>
      </div>

      {error && <p className="mt-1.5 text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        "grid h-6 w-6 place-items-center rounded-md text-muted transition-colors",
        "hover:bg-surface-2 hover:text-text",
        "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ===== Retired =====

// Off the call, still readable. Put back where it was, or removed outright: a
// prompt is not the unit of any measurement, so deleting one orphans nothing.
function RetiredList({ items }: { items: PlaybookItem[] }) {
  const update = useUpdatePlaybookItem();
  const remove = useDeletePlaybookItem();
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not do that");
    }
  };

  if (items.length === 0) {
    return <p className="mt-3 text-[12.5px] text-faint">Nothing retired.</p>;
  }

  return (
    <div className="mt-3">
      <div className="pk-list">
        {items.map((item) => (
          <div key={item.id} className="pk-li !py-3">
            <div className="pk-li-main">
              <div className="text-[13px] font-medium">{item.prompt}</div>
              <div className="mt-0.5 text-[11.5px] text-faint">
                {sectionLabel(item.section)}
                {item.hint ? ` · ${item.hint}` : ""}
              </div>
            </div>
            <div className="pk-li-meta">
              <button
                type="button"
                className="pk-link"
                onClick={() => void act(() => update.mutateAsync({ id: item.id, archived: false }))}
              >
                <ArchiveRestore size={13} aria-hidden />
                Put back
              </button>
              <button
                type="button"
                className="pk-link !text-[var(--danger)]"
                title="Remove it for good"
                onClick={() => void act(() => remove.mutateAsync(item.id))}
              >
                <Trash2 size={13} aria-hidden />
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
    </div>
  );
}

function sectionLabel(id: PlaybookSectionId): string {
  return PLAYBOOK_SECTIONS.find((s) => s.id === id)?.label ?? id;
}
