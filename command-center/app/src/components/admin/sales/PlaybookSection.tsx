import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  useCreatePlaybookCategory,
  useCreatePlaybookItem,
  useDeletePlaybookCategory,
  useDeletePlaybookItem,
  useSalesPlaybookQuery,
  useUpdatePlaybookCategory,
  useUpdatePlaybookItem,
} from "../../../hooks/useSalesPlaybook";
import {
  PLAYBOOK_SECTIONS,
  categoriesForSection,
  groupItems,
  swapTargets,
  type PlaybookCategory,
  type PlaybookGroup,
  type PlaybookItem,
  type PlaybookSectionDef,
  type PlaybookSectionId,
} from "../../../../functions/lib/salesPlaybook";

// Sales > Playbook.
//
// Where the three columns of On Call are written. Same three sections, same
// order, same headings inside them, so editing the call looks like the call: a
// change made here is what Jake reads on the phone tomorrow, and a page that
// arranged them differently would make him translate between two layouts to
// check his own work.
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
  const categories = useMemo(() => query.data?.categories ?? [], [query.data]);
  const retired = useMemo(() => items.filter((i) => i.archivedAt), [items]);

  if (query.isLoading) return <div className="pk-empty">Reading the playbook...</div>;
  if (query.isError) {
    return <div className="pk-empty">Could not load the playbook. Reload to try again.</div>;
  }

  return (
    <div>
      <p className="mb-4 max-w-[74ch] text-[13px] leading-relaxed text-muted">
        What you work through on a sales call. These three columns are what On Call draws, in this
        order. Group the prompts under headings of your own, or leave them loose. Edits save as you
        leave a box and are live on the next call.
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PLAYBOOK_SECTIONS.map((section) => (
          <SectionEditor
            key={section.id}
            section={section}
            groups={groupItems(items, categories, section.id)}
            categories={categoriesForSection(categories, section.id)}
          />
        ))}
      </div>

      {(retired.length > 0 || showRetired) && (
        <div className="mt-5">
          <button type="button" className="pk-link" onClick={() => setShowRetired((v) => !v)}>
            {showRetired ? "Hide retired prompts" : `Show retired prompts (${retired.length})`}
          </button>
          {showRetired && <RetiredList items={retired} />}
        </div>
      )}
    </div>
  );
}

// ===== One column =====

function SectionEditor({
  section,
  groups,
  categories,
}: {
  section: PlaybookSectionDef;
  groups: PlaybookGroup[];
  categories: PlaybookCategory[];
}) {
  const createItem = useCreatePlaybookItem();
  const createCategory = useCreatePlaybookCategory();
  const updateItem = useUpdatePlaybookItem();
  const updateCategory = useUpdatePlaybookCategory();

  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const addCategory = async () => {
    const name = categoryDraft.trim();
    if (!name) return;
    try {
      await createCategory.mutateAsync({ section: section.id, name });
      setCategoryDraft("");
      setAddingCategory(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that heading");
    }
  };

  // Reordering swaps two rows' sort_order rather than renumbering the column.
  // Two writes instead of n, and a failure halfway leaves an order that is odd
  // rather than an order that is wrong. Prompts and headings both.
  const moveItem = async (within: PlaybookItem[], id: string, direction: -1 | 1) => {
    const pair = swapTargets(within, id, direction);
    if (!pair) return;
    try {
      await updateItem.mutateAsync({ id: pair.a.id, sortOrder: pair.b.sortOrder });
      await updateItem.mutateAsync({ id: pair.b.id, sortOrder: pair.a.sortOrder });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder that");
    }
  };

  const moveCategory = async (id: string, direction: -1 | 1) => {
    const pair = swapTargets(categories, id, direction);
    if (!pair) return;
    try {
      await updateCategory.mutateAsync({ id: pair.a.id, sortOrder: pair.b.sortOrder });
      await updateCategory.mutateAsync({ id: pair.b.id, sortOrder: pair.a.sortOrder });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move that heading");
    }
  };

  return (
    <section className="pk-card !p-0">
      <header className="border-b border-[var(--divider)] px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            {section.label}
          </h2>
          <span className="text-[12px] font-semibold tabular-nums text-faint">{total}</span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-snug text-faint">{section.blurb}</p>
      </header>

      <div className="px-5">
        {groups.length === 0 && (
          <p className="py-4 text-[12.5px] text-faint">
            Nothing here yet. This column will be empty on the call.
          </p>
        )}

        {groups.map((group, groupIndex) => (
          <GroupBlock
            key={group.category?.id ?? "__loose"}
            section={section}
            group={group}
            categories={categories}
            canMoveUp={!!group.category && groupIndex > 0}
            canMoveDown={
              !!group.category &&
              groupIndex < groups.length - 1 &&
              // Never below the loose block: it is not a heading and has no
              // position of its own, it is simply what is left.
              !!groups[groupIndex + 1].category
            }
            onMoveCategory={(direction) =>
              group.category && void moveCategory(group.category.id, direction)
            }
            onMoveItem={(id, direction) => void moveItem(group.items, id, direction)}
          />
        ))}
      </div>

      <footer className="border-t border-[var(--divider)] px-5 py-3">
        {addingCategory ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addCategory();
            }}
          >
            <input
              className="pk-input !text-[13px]"
              value={categoryDraft}
              onChange={(e) => setCategoryDraft(e.target.value)}
              placeholder="Heading, e.g. The money"
              aria-label={`New ${section.label} heading`}
              autoFocus
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="submit"
                className="pk-btn-save !px-4 !py-1.5 !text-[12.5px]"
                disabled={!categoryDraft.trim() || createCategory.isPending}
              >
                {createCategory.isPending ? "Adding..." : "Add heading"}
              </button>
              <button
                type="button"
                className="pk-btn-cancel !px-3 !py-1.5 !text-[12.5px]"
                onClick={() => {
                  setAddingCategory(false);
                  setCategoryDraft("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Adding a prompt with no heading is still allowed and still
                useful: it is how you catch a question mid-thought and file it
                later. It lands in the loose block at the bottom. */}
            <AddPrompt section={section.id} categoryId={null} label="Add a loose prompt" />
            <button type="button" className="pk-link" onClick={() => setAddingCategory(true)}>
              <FolderPlus size={14} aria-hidden />
              Add a heading
            </button>
          </div>
        )}

        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
        {createItem.isError && (
          <p className="mt-2 text-[12px] text-danger">Could not add that prompt.</p>
        )}
      </footer>
    </section>
  );
}

// ===== One heading and the prompts under it =====

function GroupBlock({
  section,
  group,
  categories,
  canMoveUp,
  canMoveDown,
  onMoveCategory,
  onMoveItem,
}: {
  section: PlaybookSectionDef;
  group: PlaybookGroup;
  categories: PlaybookCategory[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveCategory: (direction: -1 | 1) => void;
  onMoveItem: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <div className="border-b border-[var(--divider)] py-3 last:border-b-0">
      {group.category ? (
        <CategoryHeader
          category={group.category}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMove={onMoveCategory}
        />
      ) : (
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
          Not under a heading
        </div>
      )}

      {group.items.length === 0 && (
        <p className="py-1 text-[12px] text-faint">Empty. Add the first prompt under it.</p>
      )}

      {group.items.map((item, index) => (
        <ItemEditor
          key={item.id}
          item={item}
          section={section}
          categories={categories}
          canMoveUp={index > 0}
          canMoveDown={index < group.items.length - 1}
          onMove={(direction) => onMoveItem(item.id, direction)}
        />
      ))}

      {group.category && (
        <div className="mt-1">
          <AddPrompt section={section.id} categoryId={group.category.id} label="Add a prompt" />
        </div>
      )}
    </div>
  );
}

// The heading itself: renamed in place, moved as a block, deleted without
// taking its prompts with it.
function CategoryHeader({
  category,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  category: PlaybookCategory;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const update = useUpdatePlaybookCategory();
  const remove = useDeletePlaybookCategory();
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(category.name);

  useEffect(() => {
    if (category.name !== saved.current) {
      saved.current = category.name;
      setName(category.name);
    }
  }, [category.name]);

  const save = async () => {
    const next = name.trim();
    // An emptied heading is refused by the endpoint, so put the last saved name
    // back rather than leaving a blank box that quietly is not stored.
    if (!next) {
      setName(saved.current);
      return;
    }
    if (next === saved.current) return;
    try {
      const res = await update.mutateAsync({ id: category.id, name: next });
      saved.current = res.category.name;
      setName(res.category.name);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename that");
    }
  };

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1">
        <input
          className={[
            "min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1",
            "text-[11.5px] font-bold uppercase tracking-[0.08em] text-text",
            "hover:border-[var(--border)] focus:border-[var(--brand)] focus:outline-none",
          ].join(" ")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()}
          aria-label="Heading name"
        />
        <IconButton label="Move heading up" disabled={!canMoveUp} onClick={() => onMove(-1)}>
          <ChevronUp size={13} aria-hidden />
        </IconButton>
        <IconButton label="Move heading down" disabled={!canMoveDown} onClick={() => onMove(1)}>
          <ChevronDown size={13} aria-hidden />
        </IconButton>
        <IconButton
          label="Remove this heading. Its prompts stay, unfiled."
          disabled={remove.isPending}
          onClick={() => void remove.mutateAsync(category.id).catch(() => setError("Could not remove that"))}
        >
          <Trash2 size={13} aria-hidden />
        </IconButton>
      </div>
      {error && <p className="mt-1 text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}

// ===== One prompt =====

function AddPrompt({
  section,
  categoryId,
  label,
}: {
  section: PlaybookSectionId;
  categoryId: string | null;
  label: string;
}) {
  const create = useCreatePlaybookItem();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const add = async () => {
    const prompt = draft.trim();
    if (!prompt) return;
    await create.mutateAsync({ section, prompt, categoryId });
    setDraft("");
    // The box stays open: adding one question is almost always adding three.
  };

  if (!open) {
    return (
      <button type="button" className="pk-link" onClick={() => setOpen(true)}>
        <Plus size={13} aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <input
        className="pk-input !py-1.5 !text-[12.5px]"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="The prompt itself"
        aria-label="New prompt"
        autoFocus
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="submit"
          className="pk-btn-save !px-3 !py-1 !text-[12px]"
          disabled={!draft.trim() || create.isPending}
        >
          {create.isPending ? "Adding..." : "Add"}
        </button>
        <button
          type="button"
          className="pk-btn-cancel !px-2.5 !py-1 !text-[12px]"
          onClick={() => {
            setOpen(false);
            setDraft("");
          }}
        >
          Done
        </button>
      </div>
    </form>
  );
}

// Saves on blur, and only when the text actually changed. The comparison is
// against what the server last returned rather than against a mount-time
// snapshot, so tabbing through a column without typing sends nothing at all.
function ItemEditor({
  item,
  section,
  categories,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  item: PlaybookItem;
  section: PlaybookSectionDef;
  categories: PlaybookCategory[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const update = useUpdatePlaybookItem();

  const [prompt, setPrompt] = useState(item.prompt);
  const [hint, setHint] = useState(item.hint);
  const [error, setError] = useState<string | null>(null);

  // A reorder or a refile refetches the list, which re-renders this row with
  // the same text. Without this, a row that moved would snap its boxes back to
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

  const save = async (patch: {
    prompt?: string;
    hint?: string;
    categoryId?: string | null;
    archived?: boolean;
  }) => {
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
    <div className="border-t border-[var(--divider)] py-2.5 first:border-t-0">
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

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Filing. Only offered when the column has a heading to file
                under, so an unsorted column is not carrying a dropdown with
                one useless option in it. */}
            {categories.length > 0 && (
              <select
                className="pk-select !w-auto !py-1 !text-[11.5px]"
                value={item.categoryId ?? ""}
                onChange={(e) => void save({ categoryId: e.target.value || null })}
                aria-label="Heading"
              >
                <option value="">Not under a heading</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <span className="text-[11px] text-faint">
              On the call: <span className="italic">{section.placeholder}</span>
            </span>
          </div>
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
            disabled={update.isPending}
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
        "grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors",
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
