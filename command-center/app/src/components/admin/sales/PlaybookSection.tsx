import { useEffect, useMemo, useLayoutEffect, useRef, useState } from "react";
import {
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
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
  RESERVED_KEYS,
  categoriesForSection,
  groupItems,
  keyedItems,
  swapTargets,
  tokensIn,
  type PlaybookCategory,
  type PlaybookGroup,
  type PlaybookItem,
  type PlaybookRowKind,
  type PlaybookSectionDef,
  type PlaybookSectionId,
} from "../../../../functions/lib/salesPlaybook";
import { compileFormula, isAnswerKey } from "../../../../functions/lib/callFormula";

// Sales > Playbook.
//
// The same document On Call reads, with every line editable where it sits.
// Click a line, type, click away.
//
// THE JOB IS REWORDING. Not filing, not restructuring: the script's shape is
// settled and the thing Jake does here twenty times in a sitting is change the
// words. So the page is tuned for that and for nothing else. Lines sit close
// together, the whole thing is one column of text, and the only control on
// screen at rest is the text itself.
//
// What is deliberately NOT here, having been here and been in the way:
//
//   - The heading dropdown on every line. Moving a question between headings is
//     a thing that happened once, when the script was first written, and the
//     dropdown was 39 permanent controls paying for it.
//   - The row-type buttons on every line. Same argument: a question is a
//     question. Changing one is rare enough to live behind the ... menu.
//   - The generous line spacing On Call has. That reading needs room at arm's
//     length mid-call; this reading is done leaning in, one line at a time.
//
// Everything saves on blur rather than behind a Save button. Rewording is a
// one-word edit made twenty times, and a button per edit would be twenty clicks
// whose only job is to say "yes, I meant that".
//
// Retiring is offered before deleting. A question pulled after a month is worth
// being able to look at; a question added thirty seconds ago by mistake is not,
// which is what the delete on a retired row is for.

// Full width, matching On Call. The 72-character measure it started with is
// the right answer for a page of prose and the wrong one for a list of
// one-line questions: it bought a comfortable line length nothing needed and
// paid for it in half a screen of margin.
const MEASURE = "w-full";
// Narrower than On Call's. Nothing hangs in this gutter at rest, so it exists
// only to keep the text off the left edge.
const GUTTER = "pl-3";

export default function PlaybookSection() {
  const [showRetired, setShowRetired] = useState(false);
  const query = useSalesPlaybookQuery(true);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const categories = useMemo(() => query.data?.categories ?? [], [query.data]);
  const retired = useMemo(() => items.filter((i) => i.archivedAt), [items]);

  // Every name currently in use, across both columns. A key is global on
  // purpose: {avg_ticket} asked for in Discovery is the same number the pitch
  // wants, and scoping keys per column would mean asking for it twice.
  const keys = useMemo(
    () => [
      ...RESERVED_KEYS.map((r) => ({ key: r.key, label: r.label, reserved: true })),
      ...keyedItems(items).map((i) => ({ key: i.answerKey!, label: i.prompt, reserved: false })),
    ],
    [items],
  );

  if (query.isLoading) return <div className="pk-empty">Reading the playbook...</div>;
  if (query.isError) {
    return <div className="pk-empty">Could not load the playbook. Reload to try again.</div>;
  }

  return (
    <div className={MEASURE}>
      <KeyLegend keys={keys} items={items} />

      {PLAYBOOK_SECTIONS.map((section) => (
        <SectionDoc
          key={section.id}
          section={section}
          groups={groupItems(items, categories, section.id)}
          categories={categoriesForSection(categories, section.id)}
        />
      ))}

      {(retired.length > 0 || showRetired) && (
        <div className="mt-8 border-t border-[var(--divider)] pt-4">
          <button type="button" className="pk-link" onClick={() => setShowRetired((v) => !v)}>
            {showRetired ? "Hide retired lines" : `Show retired lines (${retired.length})`}
          </button>
          {showRetired && <RetiredList items={retired} />}
        </div>
      )}
    </div>
  );
}

// ===== The names answers are filed under =====

// Every key that exists, and how many lines read it back.
//
// Collapsed by default, because it is reference rather than script. Open, it is
// the only place that says which names are available to put in a {token}: a key
// is typed on one line and spent on another, often in the other column.
//
// The count is the honest test of whether a key earns its place. A key nothing
// reads files an answer nowhere, which is usually a typo in the token meant to
// use it.
function KeyLegend({
  keys,
  items,
}: {
  keys: { key: string; label: string; reserved: boolean }[];
  items: PlaybookItem[];
}) {
  const uses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (item.archivedAt) continue;
      const named = new Set([
        ...tokensIn(item.prompt),
        ...tokensIn(item.hint),
        ...(item.kind === "calc" ? formulaKeys(item.formula) : []),
      ]);
      for (const key of named) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const [open, setOpen] = useState(false);

  return (
    <div className="mb-8 rounded-lg border border-[var(--divider)] px-4 py-2.5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-muted">
          Answer names ({keys.length})
        </span>
        <span className="text-[11.5px] text-faint">
          {open ? "Hide" : "Put {name} in any line to read the answer back"}
        </span>
      </button>

      {open && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2.5">
          {keys.length === 0 && (
            <p className="text-[12.5px] text-faint">
              Nothing filed yet. Hover a question and name its answer.
            </p>
          )}
          {keys.map((k) => {
            const count = uses.get(k.key) ?? 0;
            return (
              <div key={k.key} className="min-w-0" title={k.label}>
                <div className="font-mono text-[12.5px] font-semibold text-text">{k.key}</div>
                <div className="text-[11px] text-faint">
                  {k.reserved ? "from the booking" : "from a question"}
                  {count > 0 ? ` · read by ${count}` : " · not read yet"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formulaKeys(formula: string): string[] {
  const compiled = compileFormula(formula);
  return compiled.ok ? compiled.formula.keys : [];
}

// ===== A borderless box that grows =====

// Every editable thing on this page is one of these. No border, no background,
// no visible field: the text sits where it will sit on the call, and the only
// sign it can be typed in is the rule that appears under it while it has focus.
//
// It grows rather than scrolls, because a line you cannot see all of is a line
// you cannot proofread, which is the entire job of this page.
function AutoTextarea({
  value,
  onChange,
  onBlur,
  className,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  className: string;
  placeholder?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Before paint, so a line never renders at one row and then jumps to three.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={[
        "w-full resize-none border-0 border-b border-transparent bg-transparent px-0 py-0",
        "outline-none transition-colors placeholder:text-faint/70",
        "hover:border-[var(--divider)] focus:border-[var(--brand)]",
        className,
      ].join(" ")}
    />
  );
}

// ===== One half of the call =====

function SectionDoc({
  section,
  groups,
  categories,
}: {
  section: PlaybookSectionDef;
  groups: PlaybookGroup[];
  categories: PlaybookCategory[];
}) {
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
  // rather than an order that is wrong. Lines and headings both.
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
    <section className="mb-10">
      <header className="mb-4 flex items-baseline justify-between gap-4 border-b border-[var(--divider)] pb-2">
        <h2 className="text-[15px] font-semibold uppercase tracking-[0.16em] text-text">
          {section.label}
        </h2>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-faint">{total}</span>
      </header>

      {groups.length === 0 && (
        <p className="text-[13.5px] text-faint">
          Nothing here yet. This half of the call will be empty.
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

      <div className={`${GUTTER} mt-5`}>
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
              placeholder="Heading, e.g. Data collection"
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
          <button type="button" className="pk-link" onClick={() => setAddingCategory(true)}>
            <Plus size={13} aria-hidden />
            Add a heading
          </button>
        )}
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
      </div>
    </section>
  );
}

// ===== One heading and the lines under it =====

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
    <div className="mb-5">
      {group.category ? (
        <CategoryHeading
          category={group.category}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMove={onMoveCategory}
        />
      ) : (
        // The same rule the real headings get, so the unfiled block reads as a
        // block rather than as lines that fell off the one above it.
        <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
          Not under a heading
          <span className="h-px flex-1 bg-[var(--divider)]" aria-hidden />
        </h3>
      )}

      {group.items.map((item, index) => (
        <LineEditor
          key={item.id}
          item={item}
          categories={categories}
          canMoveUp={index > 0}
          canMoveDown={index < group.items.length - 1}
          onMove={(direction) => onMoveItem(item.id, direction)}
        />
      ))}

      <div className={`${GUTTER} mt-1`}>
        <AddLine section={section.id} categoryId={group.category?.id ?? null} />
      </div>
    </div>
  );
}

// The heading itself: renamed in place, moved as a block, deleted without
// taking its lines with it.
function CategoryHeading({
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
    // back rather than leaving a blank that quietly is not stored.
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
    <div className="group/head mb-2">
      <div className="flex items-center gap-2">
        {/* Sized to its own text rather than stretched across the page, so the
            rule beside it starts where the heading ends. A full-width input
            would put the divider a thousand pixels away from the word it
            belongs to. */}
        <input
          size={Math.max(name.length, 4)}
          className={[
            "min-w-0 shrink border-0 border-b border-transparent bg-transparent px-0 py-0",
            "text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]",
            "outline-none transition-colors hover:border-[var(--divider)] focus:border-[var(--brand)]",
          ].join(" ")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()}
          aria-label="Heading name"
        />
        {/* The divider. It runs from the end of the heading to the edge of the
            page, which is what turns a full-width column of lines into blocks
            you can find your place in. */}
        <span className="h-px flex-1 bg-[var(--divider)]" aria-hidden />
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/head:opacity-100">
          <IconButton label="Move heading up" disabled={!canMoveUp} onClick={() => onMove(-1)}>
            <ChevronUp size={13} aria-hidden />
          </IconButton>
          <IconButton label="Move heading down" disabled={!canMoveDown} onClick={() => onMove(1)}>
            <ChevronDown size={13} aria-hidden />
          </IconButton>
          <IconButton
            label="Remove this heading. Its lines stay, unfiled."
            disabled={remove.isPending}
            onClick={() =>
              void remove.mutateAsync(category.id).catch(() => setError("Could not remove that"))
            }
          >
            <Trash2 size={13} aria-hidden />
          </IconButton>
        </div>
      </div>
      {error && <p className="mt-1 text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}

// ===== One line =====

const KIND_LABEL: Record<PlaybookRowKind, string> = {
  question: "Question",
  script: "Script line",
  calc: "Calculation",
};

const KIND_BLURB: Record<PlaybookRowKind, string> = {
  question: "Asked, with a box to type their answer into.",
  script: "Read out. No answer box, and it keeps its line breaks.",
  calc: "A number worked out from earlier answers.",
};

// Saves on blur, and only when the text actually changed. The comparison is
// against what the server last returned rather than against a mount-time
// snapshot, so tabbing through the page without typing sends nothing at all.
function LineEditor({
  item,
  categories,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  item: PlaybookItem;
  categories: PlaybookCategory[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const update = useUpdatePlaybookItem();
  const remove = useDeletePlaybookItem();

  const [prompt, setPrompt] = useState(item.prompt);
  const [hint, setHint] = useState(item.hint);
  const [answerKey, setAnswerKey] = useState(item.answerKey ?? "");
  const [formula, setFormula] = useState(item.formula);
  const [error, setError] = useState<string | null>(null);

  // A reorder or a refile refetches the list, which re-renders this line with
  // the same text. Without this, a line that moved would snap its boxes back to
  // whatever they held when it mounted.
  const serverPrompt = useRef(item.prompt);
  const serverHint = useRef(item.hint);
  const serverKey = useRef(item.answerKey ?? "");
  const serverFormula = useRef(item.formula);
  useEffect(() => {
    if (item.prompt !== serverPrompt.current) {
      serverPrompt.current = item.prompt;
      setPrompt(item.prompt);
    }
    if (item.hint !== serverHint.current) {
      serverHint.current = item.hint;
      setHint(item.hint);
    }
    const key = item.answerKey ?? "";
    if (key !== serverKey.current) {
      serverKey.current = key;
      setAnswerKey(key);
    }
    if (item.formula !== serverFormula.current) {
      serverFormula.current = item.formula;
      setFormula(item.formula);
    }
  }, [item.prompt, item.hint, item.answerKey, item.formula]);

  const save = async (patch: {
    kind?: PlaybookRowKind;
    prompt?: string;
    hint?: string;
    answerKey?: string | null;
    formula?: string;
    format?: string;
    categoryId?: string | null;
    archived?: boolean;
  }) => {
    try {
      const res = await update.mutateAsync({ id: item.id, ...patch });
      serverPrompt.current = res.item.prompt;
      serverHint.current = res.item.hint;
      serverKey.current = res.item.answerKey ?? "";
      serverFormula.current = res.item.formula;
      // The server tidies what it stores (whitespace, length), so the page shows
      // what was actually saved rather than what was typed at it.
      setPrompt(res.item.prompt);
      setHint(res.item.hint);
      setAnswerKey(res.item.answerKey ?? "");
      setFormula(res.item.formula);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
    }
  };

  // An emptied line is one Jake is deleting by clearing it, which the endpoint
  // refuses. Put the last saved text back rather than leaving a blank that
  // quietly is not stored.
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

  // A refused key stays in the box rather than snapping back. It is almost
  // always a name already used elsewhere, and putting the old one back would
  // throw away the typing along with the mistake.
  const saveKey = () => {
    const next = answerKey.trim().toLowerCase();
    if (next === serverKey.current) return;
    if (next !== "" && !isAnswerKey(next)) {
      setError("Lowercase letters, digits and underscores, starting with a letter.");
      return;
    }
    void save({ answerKey: next || null });
  };

  const saveFormula = () => {
    const next = formula.trim();
    if (next === serverFormula.current) return;
    void save({ formula: next });
  };

  const isScript = item.kind === "script";
  const isCalc = item.kind === "calc";
  const formulaCheck = isCalc ? compileFormula(formula) : null;

  // The rarely-wanted half: what kind of line this is, which heading it sits
  // under, and what its answer is filed as. Behind one click because between
  // them they were three controls on all 82 lines, permanently, to serve edits
  // Jake makes about twice a year.
  const [more, setMore] = useState(false);

  // Delete asks once, in place. Not a dialog: a modal for one line of a script
  // is heavier than the thing it protects, and window.confirm blocks the whole
  // page. The second click is the confirmation, and moving the mouse away is
  // the cancel.
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group/line relative py-1">
      <div className={GUTTER}>
        {/* The line as it will be read. Same size, same weight, same line
            height as On Call draws it, because judging the wording is the
            whole reason this page exists. */}
        {/* The line, and the only thing on screen at rest. Tighter than On
            Call draws it: that page is read at arm's length mid-call and needs
            the room; this one is read leaning in, one line at a time. */}
        <AutoTextarea
          value={prompt}
          onChange={setPrompt}
          onBlur={savePrompt}
          ariaLabel={isCalc ? "Calculation label" : isScript ? "Script line" : "Question"}
          className={[
            "text-[14.5px] leading-[1.45] text-text",
            isScript ? "font-normal" : "font-medium",
            isCalc ? "!text-[13px] !text-muted" : "",
          ].join(" ")}
        />

        {/* The direction under it. Hidden while empty until the line is
            hovered, so a script with no notes on it stays a clean read. */}
        <div
          className={[
            "transition-opacity",
            hint === "" ? "opacity-0 focus-within:opacity-100 group-hover/line:opacity-100" : "",
          ].join(" ")}
        >
          <AutoTextarea
            value={hint}
            onChange={setHint}
            onBlur={saveHint}
            placeholder="Note to yourself. Optional."
            ariaLabel="Note"
            className="text-[11.5px] italic leading-snug text-faint"
          />
        </div>

        {isCalc && (
          <div className="mt-1.5 flex max-w-[52ch] items-start gap-2">
            <input
              className="pk-input !py-1 !font-mono !text-[11.5px]"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              onBlur={saveFormula}
              placeholder="(goal - installs) * avg_ticket"
              aria-label="Formula"
            />
            <select
              className="pk-select !w-auto shrink-0 !py-1 !text-[11.5px]"
              value={item.format}
              onChange={(e) => void save({ format: e.target.value })}
              aria-label="How the number is shown"
            >
              <option value="money">$</option>
              <option value="number">123</option>
            </select>
          </div>
        )}
        {isCalc && formula.trim() !== "" && (
          <p className={`mt-1 text-[11px] ${formulaCheck?.ok ? "text-faint" : "text-danger"}`}>
            {formulaCheck?.ok
              ? `Reads ${formulaCheck.formula.keys.join(", ") || "no answers, so it is a fixed number"}`
              : formulaCheck?.error}
          </p>
        )}

        {/* What this answer is filed under. On screen only where it IS filed,
            because that is the thing that makes a later line fill itself in.
            The other seventy-odd lines file nothing and say nothing; naming one
            is under the ... below. */}
        {!isScript && answerKey !== "" && (
          <div className="flex items-baseline gap-1.5">
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-faint">
              {isCalc ? "named" : "used later as"}
            </span>
            <input
              className={[
                "min-w-0 border-0 border-b border-transparent bg-transparent px-0 py-0",
                "font-mono text-[11px] text-muted outline-none transition-colors",
                "hover:border-[var(--divider)] focus:border-[var(--brand)]",
              ].join(" ")}
              value={answerKey}
              onChange={(e) => setAnswerKey(e.target.value)}
              onBlur={saveKey}
              aria-label="Answer name"
            />
          </div>
        )}

        {/* Move, retire, and one door to everything else. Four small marks that
            appear on hover, against 82 lines of script: anything permanently on
            screen here is competing with the words. */}
        <div
          className="absolute right-0 top-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/line:opacity-100"
          // Moving off the line drops a half-pressed delete, which is the
          // cheapest cancel there is.
          onMouseLeave={() => setConfirming(false)}
        >
          {confirming ? (
            <>
              <span className="mr-1 text-[11px] font-semibold text-danger">Delete for good?</span>
              <button
                type="button"
                className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-[var(--danger)] hover:bg-surface-2"
                disabled={remove.isPending}
                onClick={() =>
                  void remove
                    .mutateAsync(item.id)
                    .catch(() => setError("Could not remove that"))
                    .finally(() => setConfirming(false))
                }
              >
                {remove.isPending ? "Deleting..." : "Yes"}
              </button>
              <button
                type="button"
                className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-muted hover:bg-surface-2"
                onClick={() => setConfirming(false)}
              >
                No
              </button>
            </>
          ) : (
            <>
              <IconButton
                label="Move up"
                disabled={!canMoveUp || update.isPending}
                onClick={() => onMove(-1)}
              >
                <ChevronUp size={13} aria-hidden />
              </IconButton>
              <IconButton
                label="Move down"
                disabled={!canMoveDown || update.isPending}
                onClick={() => onMove(1)}
              >
                <ChevronDown size={13} aria-hidden />
              </IconButton>
              {/* Anything half-typed above is already saved by the time either
                  of these fires: the mousedown blurs the box, and blur is what
                  saves. */}
              <IconButton
                label="Retire this line. It comes off the call and stays under Show retired."
                disabled={update.isPending}
                onClick={() => void save({ archived: true })}
              >
                <Undo2 size={13} aria-hidden />
              </IconButton>
              {/* Retiring is still offered first, and is still the right answer
                  for a line that might come back. This is for the one added by
                  mistake thirty seconds ago: nothing counts playbook lines, so
                  removing one orphans no history. */}
              <IconButton
                label="Delete this line for good"
                disabled={remove.isPending}
                onClick={() => setConfirming(true)}
              >
                <Trash2 size={13} aria-hidden />
              </IconButton>
              <IconButton label="Type, heading and answer name" onClick={() => setMore((v) => !v)}>
                <MoreHorizontal size={13} aria-hidden />
              </IconButton>
            </>
          )}
        </div>

        {more && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-surface-2 px-2.5 py-2">
            <div className="flex items-center gap-1">
              {(Object.keys(KIND_LABEL) as PlaybookRowKind[]).map((kind) => {
                const on = kind === item.kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    title={KIND_BLURB[kind]}
                    aria-pressed={on}
                    onClick={() => !on && void save({ kind })}
                    className={[
                      "rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider transition-colors",
                      on ? "text-[var(--brand)]" : "text-faint hover:text-text",
                    ].join(" ")}
                  >
                    {KIND_LABEL[kind]}
                  </button>
                );
              })}
            </div>

            {/* Refiling. Only offered when the column has a heading to file
                under, so an unsorted column is not carrying a dropdown with one
                useless option in it. */}
            {categories.length > 0 && (
              <select
                className="pk-select !w-auto !py-0.5 !text-[10.5px]"
                value={item.categoryId ?? ""}
                onChange={(e) => void save({ categoryId: e.target.value || null })}
                aria-label="Heading"
              >
                <option value="">No heading</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            {!isScript && answerKey === "" && (
              <input
                className="pk-input !w-[150px] !py-0.5 !font-mono !text-[10.5px]"
                value={answerKey}
                onChange={(e) => setAnswerKey(e.target.value)}
                onBlur={saveKey}
                placeholder="used later as..."
                aria-label="Answer name"
              />
            )}
          </div>
        )}

        {error && <p className="text-[11.5px] text-danger">{error}</p>}
      </div>
    </div>
  );
}

// ===== Adding =====

function AddLine({ section, categoryId }: { section: PlaybookSectionId; categoryId: string | null }) {
  const create = useCreatePlaybookItem();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PlaybookRowKind>("question");
  const [draft, setDraft] = useState("");
  const [key, setKey] = useState("");
  const [formula, setFormula] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A calc is the one type that cannot be added and filled in later: it has to
  // have a name and a sum, because without either there is no number for the
  // line to be. The button says so rather than the server refusing after a
  // click.
  const formulaCheck = kind === "calc" ? compileFormula(formula) : null;
  const ready =
    !!draft.trim() &&
    (kind !== "calc" || (isAnswerKey(key.trim().toLowerCase()) && !!formulaCheck?.ok));

  const add = async () => {
    const prompt = draft.trim();
    if (!prompt) return;
    try {
      await create.mutateAsync({
        section,
        kind,
        prompt,
        categoryId,
        answerKey: key.trim() ? key.trim().toLowerCase() : null,
        formula: kind === "calc" ? formula.trim() : "",
        // Money is right far more often than not for a calc: the numbers a
        // sales call says out loud are dollars. A count is one click away.
        format: kind === "calc" ? "money" : "number",
      });
      setDraft("");
      setKey("");
      setFormula("");
      setError(null);
      // The boxes stay open: adding one line is almost always adding three.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="pk-link !text-[12px] opacity-60 transition-opacity hover:opacity-100"
        onClick={() => setOpen(true)}
      >
        <Plus size={12} aria-hidden />
        Add a line
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
      <div className="mb-1.5 flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Line type">
        {(Object.keys(KIND_LABEL) as PlaybookRowKind[]).map((k) => {
          const on = k === kind;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              title={KIND_BLURB[k]}
              onClick={() => setKind(k)}
              className={[
                "rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider transition-colors",
                on ? "text-[var(--brand)]" : "text-faint hover:text-text",
              ].join(" ")}
            >
              {KIND_LABEL[k]}
            </button>
          );
        })}
      </div>

      {kind === "script" ? (
        <textarea
          className="pk-input !py-1.5 !text-[13px]"
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What you read out. Line breaks are kept."
          aria-label="New script line"
          autoFocus
        />
      ) : (
        <input
          className="pk-input !py-1.5 !text-[13px]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={kind === "calc" ? "What the number is, e.g. Extra profit a month" : "The question itself"}
          aria-label={kind === "calc" ? "New calculation label" : "New question"}
          autoFocus
        />
      )}

      {kind !== "script" && (
        <input
          className="pk-input !mt-1.5 !py-1.5 !font-mono !text-[11.5px]"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={kind === "calc" ? "Name it, e.g. gap_profit" : "Used later as, e.g. avg_ticket. Optional."}
          aria-label="Answer name"
        />
      )}

      {kind === "calc" && (
        <>
          <input
            className="pk-input !mt-1.5 !py-1.5 !font-mono !text-[11.5px]"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="(goal - installs) * avg_ticket"
            aria-label="Formula"
          />
          {formula.trim() !== "" && (
            <p className={`mt-1 text-[11px] ${formulaCheck?.ok ? "text-faint" : "text-danger"}`}>
              {formulaCheck?.ok
                ? `Reads ${formulaCheck.formula.keys.join(", ") || "no answers, so it is a fixed number"}`
                : formulaCheck?.error}
            </p>
          )}
        </>
      )}

      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="submit"
          className="pk-btn-save !px-3 !py-1 !text-[12px]"
          disabled={!ready || create.isPending}
        >
          {create.isPending ? "Adding..." : "Add"}
        </button>
        <button
          type="button"
          className="pk-btn-cancel !px-2.5 !py-1 !text-[12px]"
          onClick={() => {
            setOpen(false);
            setDraft("");
            setKey("");
            setFormula("");
            setError(null);
          }}
        >
          Done
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11.5px] text-danger">{error}</p>}
    </form>
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
// line is not the unit of any measurement, so deleting one orphans nothing.
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
