import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAgencyPipelinesQuery } from "../../../hooks/useColdCall";
import type { AgencyPipelineCard } from "../../../lib/api";

// Cold Call > Pipelines: the agency's own GoHighLevel boards, one tab each.
//
// Read only, on purpose. Every card here was put where it is by one of Jake's
// workflows, and this app's job stops at the tag that triggered it. A drag
// handle would be a second hand on the same card and the two would disagree
// within a week.
//
// The boards are Jake's live structure, not a copy: stage names, stage order and
// the pipelines themselves come from the account on every view. Rename a stage
// over there and this renames itself.

export default function ColdCallPipelines() {
  const [selected, setSelected] = useState<string | null>(null);

  // First call fetches the structure; once a pipeline is picked the same
  // endpoint returns its cards too.
  const query = useAgencyPipelinesQuery(selected ?? undefined);
  const pipelines = query.data?.pipelines ?? [];

  // Default to the first pipeline (Cold Call Leads), which is the one a caller
  // wants, without making them pick before anything renders. Selecting it for
  // real rather than just drawing it is what fetches its cards: a board of empty
  // columns that has not actually asked about them is a lie by omission.
  const activeId = selected ?? pipelines[0]?.id ?? null;
  const active = pipelines.find((p) => p.id === activeId) ?? null;

  useEffect(() => {
    if (selected === null && pipelines[0]) setSelected(pipelines[0].id);
  }, [selected, pipelines]);

  const columns = useMemo(() => {
    if (!active) return [];
    const cards = query.data?.opportunities ?? [];
    const byStage = new Map<string, AgencyPipelineCard[]>();
    for (const card of cards) {
      const list = byStage.get(card.stageId) ?? [];
      list.push(card);
      byStage.set(card.stageId, list);
    }
    return active.stages.map((s) => ({ ...s, cards: byStage.get(s.id) ?? [] }));
  }, [active, query.data]);

  if (query.isLoading && !query.data) {
    return <div className="pk-empty">Reading your pipelines...</div>;
  }

  if (query.isError) {
    return (
      <div className="pk-empty">
        Could not reach GoHighLevel. The boards live there, so there is nothing to
        show until it answers. Reload to try again.
      </div>
    );
  }

  if (query.data && !query.data.configured) {
    return (
      <div className="pk-needs">
        The agency GoHighLevel account is not connected, so there are no boards to
        read.
      </div>
    );
  }

  if (!active) {
    return <div className="pk-empty">There are no pipelines in that account.</div>;
  }

  // Cards are only fetched once a pipeline is chosen; before that the board is
  // structure only, which would read as "everything is empty".
  const loadedCards = selected !== null || query.data?.opportunities !== undefined;
  const total = (query.data?.opportunities ?? []).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="pk-subtabs !m-0" aria-label="Pipelines">
          {pipelines.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pk-subtab${p.id === activeId ? " on" : ""}`}
              onClick={() => setSelected(p.id)}
            >
              {p.name}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-[12.5px] text-muted">
          {loadedCards && (
            <span>
              {total} {total === 1 ? "card" : "cards"}
            </span>
          )}
          <button
            type="button"
            className="pk-link"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} aria-hidden />
            {query.isFetching ? "Reading" : "Refresh"}
          </button>
        </div>
      </div>

      {/* One column per stage, in the order GHL draws them. Scrolls sideways
          inside itself: the page body never scrolls horizontally. */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <section
            key={col.id}
            className="flex w-[248px] shrink-0 flex-col rounded-[var(--radius-lg)] border border-border bg-surface-2/40"
          >
            <header className="flex items-center justify-between gap-2 border-b border-divider px-3 py-2.5">
              <h3 className="truncate font-display text-[13px] font-semibold">{col.name}</h3>
              <span className="font-mono text-[12px] text-muted">{col.cards.length}</span>
            </header>

            <div className="flex flex-col gap-2 p-2">
              {col.cards.length === 0 ? (
                <p className="px-1 py-4 text-center text-[12px] text-faint">
                  {loadedCards ? "Empty" : "..."}
                </p>
              ) : (
                col.cards.map((card) => <Card key={card.id} card={card} />)
              )}
            </div>
          </section>
        ))}
      </div>

      <p className="pk-needs" style={{ marginTop: 14 }}>
        Read live from GoHighLevel and read only. Cards move when your workflows
        move them; nothing in this console touches them.
      </p>
    </div>
  );
}

function Card({ card }: { card: AgencyPipelineCard }) {
  // Only the tags this app writes are worth the room on a card: the rest are
  // Jake's own and belong to whatever workflow put them there.
  const ccTags = card.tags.filter((t) => t.toLowerCase().startsWith("cc "));

  return (
    <article className="rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5">
      <p className="truncate text-[13px] font-medium">{card.name}</p>
      {card.phone && (
        <p className="mt-0.5 truncate font-mono text-[11.5px] text-muted">{card.phone}</p>
      )}
      {card.value !== null && (
        <p className="mt-1 font-mono text-[12px] text-brand">
          ${card.value.toLocaleString()}
        </p>
      )}
      {ccTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {ccTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
