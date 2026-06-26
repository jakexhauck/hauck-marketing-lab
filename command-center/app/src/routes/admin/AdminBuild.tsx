import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Copy,
  Pencil,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Hammer,
  Sparkles,
  CheckCircle2,
  X,
  FlaskConical,
} from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../context/ToastContext";
import {
  loadCards,
  saveCards,
  newCard,
  buildPrompt,
  STATUS_ORDER,
  STATUS_LABEL,
  AREA_SUGGESTIONS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABEL,
  DEFAULT_PROJECT_TYPE,
  type BuildCard,
  type BuildStatus,
  type ProjectType,
} from "../../lib/buildLab";

// Build Lab. A backed-by-localStorage idea board so building the software is a
// visual, satisfying loop instead of a blank prompt box: capture an idea, let
// the composer assemble a clean Claude Code prompt, copy it, then drag the card
// idea -> building -> shipped. Light gamification (a progress bar + a shipped
// counter) keeps momentum visible. No API, no backend; this is Jake's cockpit.

const inputCls =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

const STATUS_ICON: Record<BuildStatus, typeof Sparkles> = {
  idea: Sparkles,
  building: Hammer,
  shipped: CheckCircle2,
};

interface ComposerState {
  id: string | null; // null = creating, else editing
  title: string;
  projectType: ProjectType;
  area: string;
  want: string;
  details: string;
}

const EMPTY_COMPOSER: ComposerState = {
  id: null,
  title: "",
  projectType: DEFAULT_PROJECT_TYPE,
  area: "",
  want: "",
  details: "",
};

export default function AdminBuild() {
  const { showToast } = useToast();
  const [cards, setCards] = useState<BuildCard[]>([]);
  const [composer, setComposer] = useState<ComposerState | null>(null);

  // Load once on mount, persist on every change.
  useEffect(() => {
    setCards(loadCards());
  }, []);
  useEffect(() => {
    saveCards(cards);
  }, [cards]);

  const shipped = cards.filter((c) => c.status === "shipped").length;
  const inFlight = cards.filter((c) => c.status === "building").length;
  const total = cards.length;
  const pct = total === 0 ? 0 : Math.round((shipped / total) * 100);

  const byStatus = useMemo(() => {
    const map: Record<BuildStatus, BuildCard[]> = {
      idea: [],
      building: [],
      shipped: [],
    };
    // Newest first within each column.
    for (const c of [...cards].sort((a, b) => b.createdAt - a.createdAt)) {
      map[c.status].push(c);
    }
    return map;
  }, [cards]);

  function openNew() {
    setComposer({ ...EMPTY_COMPOSER });
  }

  function openEdit(card: BuildCard) {
    setComposer({
      id: card.id,
      title: card.title,
      // Older cards predate project types; fall back to the default.
      projectType: card.projectType ?? DEFAULT_PROJECT_TYPE,
      area: card.area,
      want: card.want,
      details: card.details,
    });
  }

  function saveComposer() {
    if (!composer || !composer.title.trim()) return;
    if (composer.id) {
      // Edit in place, keep status/timestamps.
      setCards((list) =>
        list.map((c) =>
          c.id === composer.id
            ? {
                ...c,
                title: composer.title.trim(),
                projectType: composer.projectType,
                area: composer.area.trim(),
                want: composer.want.trim(),
                details: composer.details.trim(),
              }
            : c,
        ),
      );
      showToast("Idea updated");
    } else {
      setCards((list) => [
        newCard({
          title: composer.title,
          projectType: composer.projectType,
          area: composer.area,
          want: composer.want,
          details: composer.details,
        }),
        ...list,
      ]);
      showToast("Idea added");
    }
    setComposer(null);
  }

  function move(card: BuildCard, dir: 1 | -1) {
    const idx = STATUS_ORDER.indexOf(card.status);
    const next = STATUS_ORDER[idx + dir];
    if (!next) return;
    setCards((list) =>
      list.map((c) =>
        c.id === card.id
          ? {
              ...c,
              status: next,
              shippedAt: next === "shipped" ? Date.now() : null,
            }
          : c,
      ),
    );
    if (next === "shipped") showToast("Shipped. Nice.");
  }

  function remove(card: BuildCard) {
    setCards((list) => list.filter((c) => c.id !== card.id));
  }

  async function copyPrompt(card: BuildCard | ComposerState) {
    const text = buildPrompt(card);
    try {
      await navigator.clipboard.writeText(text);
      showToast("Prompt copied. Paste it into Claude Code.");
    } catch {
      showToast("Could not copy. Select the preview text manually.");
    }
  }

  return (
    <DesktopPage
      title="Build Lab"
      subtitle={
        total === 0
          ? "Capture what you want built, get a clean prompt, ship it."
          : `${shipped} shipped · ${inFlight} building · ${total} total`
      }
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => window.open("/home?demo=1", "_blank")}
            title="Open the client app in a new tab with fabricated demo data"
          >
            <FlaskConical size={16} /> Demo client view
          </Button>
          <Button variant="primary" onClick={openNew}>
            <Plus size={16} /> New idea
          </Button>
        </div>
      }
    >
      {/* Light gamification strip: shipped progress. Subtle, professional. */}
      <div className="mb-6 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
        <div className="mb-2 flex items-center justify-between text-[13px]">
          <span className="font-medium text-text">Shipped progress</span>
          <span className="text-muted">
            {shipped} / {total} {total === 1 ? "idea" : "ideas"} ({pct}%)
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Board: three columns. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {STATUS_ORDER.map((status) => {
          const Icon = STATUS_ICON[status];
          const items = byStatus[status];
          return (
            <div
              key={status}
              className="flex flex-col rounded-[var(--radius-lg)] border border-border bg-bg/40"
            >
              <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
                <Icon size={15} className="text-muted" />
                <span className="text-[13px] font-semibold text-text">
                  {STATUS_LABEL[status]}
                </span>
                <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                  {items.length}
                </span>
              </div>

              <div className="flex flex-col gap-2.5 p-3">
                {items.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12.5px] text-faint">
                    {status === "idea"
                      ? "Add an idea to start."
                      : "Nothing here yet."}
                  </p>
                ) : (
                  items.map((card) => (
                    <BuildCardItem
                      key={card.id}
                      card={card}
                      onCopy={() => void copyPrompt(card)}
                      onEdit={() => openEdit(card)}
                      onDelete={() => remove(card)}
                      onForward={() => move(card, 1)}
                      onBack={() => move(card, -1)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {composer && (
        <Composer
          state={composer}
          onChange={setComposer}
          onClose={() => setComposer(null)}
          onSave={saveComposer}
          onCopy={() => void copyPrompt(composer)}
        />
      )}
    </DesktopPage>
  );
}

function BuildCardItem({
  card,
  onCopy,
  onEdit,
  onDelete,
  onForward,
  onBack,
}: {
  card: BuildCard;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onForward: () => void;
  onBack: () => void;
}) {
  const canBack = card.status !== "idea";
  const canForward = card.status !== "shipped";
  return (
    <div className="group rounded-[var(--radius)] border border-border bg-surface p-3 shadow-[var(--shadow-sm)] transition-colors hover:border-border-strong">
      <div className="mb-1 text-[13.5px] font-semibold leading-snug text-text">
        {card.title}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="inline-block rounded-full bg-brand/10 px-2 py-0.5 text-[10.5px] font-medium text-brand">
          {PROJECT_TYPE_LABEL[card.projectType ?? DEFAULT_PROJECT_TYPE]}
        </span>
        {card.area && (
          <span className="inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium text-muted">
            {card.area}
          </span>
        )}
      </div>
      {card.want && (
        <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-muted">
          {card.want}
        </p>
      )}

      <div className="mt-3 flex items-center gap-1 border-t border-divider pt-2.5">
        <button
          onClick={onCopy}
          className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand/10 px-2 text-[11.5px] font-medium text-brand transition-colors hover:bg-brand/20"
          title="Copy the assembled prompt"
        >
          <Copy size={12.5} /> Copy prompt
        </button>
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <IconBtn label="Edit" onClick={onEdit}>
            <Pencil size={13.5} />
          </IconBtn>
          <IconBtn label="Delete" danger onClick={onDelete}>
            <Trash2 size={13.5} />
          </IconBtn>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        {canBack && (
          <button
            onClick={onBack}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-border text-[11.5px] text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <ArrowLeft size={12.5} /> Back
          </button>
        )}
        {canForward && (
          <button
            onClick={onForward}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-[var(--radius-sm)] bg-brand text-[11.5px] font-medium text-brand-fg transition-colors hover:bg-brand-strong"
          >
            {card.status === "building" ? "Ship it" : "Start"}{" "}
            <ArrowRight size={12.5} />
          </button>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        "flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-faint transition-colors",
        danger
          ? "hover:bg-danger-tint hover:text-danger"
          : "hover:bg-surface-2 hover:text-text",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Composer({
  state,
  onChange,
  onClose,
  onSave,
  onCopy,
}: {
  state: ComposerState;
  onChange: (next: ComposerState) => void;
  onClose: () => void;
  onSave: () => void;
  onCopy: () => void;
}) {
  const set = (patch: Partial<ComposerState>) => onChange({ ...state, ...patch });
  const preview = buildPrompt(state);
  const canSave = state.title.trim() !== "";

  // Close on Escape for a fast, keyboard-friendly loop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-3 border-b border-divider px-5 py-3.5">
          <Sparkles size={16} className="text-brand" />
          <h2 className="font-display text-[16px] font-bold text-text">
            {state.id ? "Edit idea" : "New idea"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-faint hover:bg-surface-2 hover:text-text"
          >
            <X size={17} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto md:grid-cols-2">
          {/* Left: the guided form. */}
          <div className="flex flex-col gap-3.5 border-b border-divider p-5 md:border-b-0 md:border-r">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-muted">Title</span>
              <input
                className={inputCls}
                value={state.title}
                autoFocus
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Short name for this build"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-muted">
                Project type
              </span>
              <div className="flex flex-wrap gap-1">
                {PROJECT_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => set({ projectType: t.key })}
                    className={[
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      state.projectType === t.key
                        ? "bg-brand text-brand-fg"
                        : "border border-border text-muted hover:text-text",
                    ].join(" ")}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-faint">
                Sets which Build Rules (Spine + Modules) get baked into the
                prompt.
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-muted">Area</span>
              <input
                className={inputCls}
                value={state.area}
                onChange={(e) => set({ area: e.target.value })}
                placeholder="Which page / part of the app?"
              />
              <div className="mt-1 flex flex-wrap gap-1">
                {AREA_SUGGESTIONS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set({ area: a })}
                    className={[
                      "rounded-full px-2 py-0.5 text-[10.5px] font-medium transition-colors",
                      state.area === a
                        ? "bg-brand text-brand-fg"
                        : "border border-border text-muted hover:text-text",
                    ].join(" ")}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-muted">
                What do you want?
              </span>
              <textarea
                className={`${inputCls} min-h-[90px] resize-y`}
                value={state.want}
                onChange={(e) => set({ want: e.target.value })}
                placeholder="Describe the change in plain words. What should it do?"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-muted">
                Details / constraints{" "}
                <span className="text-faint">(optional)</span>
              </span>
              <textarea
                className={`${inputCls} min-h-[64px] resize-y`}
                value={state.details}
                onChange={(e) => set({ details: e.target.value })}
                placeholder="Edge cases, don't-touch areas, look & feel notes..."
              />
            </label>
          </div>

          {/* Right: live prompt preview. */}
          <div className="flex flex-col bg-bg/40 p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted">
                Prompt preview
              </span>
              <button
                onClick={onCopy}
                className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand/10 px-2 text-[11.5px] font-medium text-brand transition-colors hover:bg-brand/20"
              >
                <Copy size={12.5} /> Copy
              </button>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] border border-border bg-surface p-3 font-mono text-[11.5px] leading-relaxed text-text">
              {preview}
            </pre>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-divider px-5 py-3.5">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={onSave}>
            {state.id ? "Save changes" : "Add to board"}
          </Button>
        </div>
      </div>
    </div>
  );
}
