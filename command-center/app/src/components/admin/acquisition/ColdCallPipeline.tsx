import { useMemo, useRef } from "react";
import { ExternalLink, Phone } from "lucide-react";
import BoardScrollbar from "../../BoardScrollbar";
import { useAgencyPipelinesQuery } from "../../../hooks/useColdCall";
import { pickColdCallPipeline } from "../../../lib/stageDrift";
import { COLD_CALL_STAGES } from "../../../lib/coldCallStages";
import { ghlContactUrl, stageTone } from "../../../lib/setterModel";
import { timeAgo } from "../../../lib/timeAgo";
import { groupByStage } from "../../../../functions/lib/agencyPipelines";
import type { AgencyPipelineCard } from "../../../lib/api";

// Cold Call > Pipeline: the agency's cold calling board in GoHighLevel, drawn
// as a board.
//
// This replaced the five stage pages (Jake, 2026-08-20). Dialing happens in
// GoHighLevel's power dialer now, so the console's job here is no longer to
// hand somebody the next name off a filtered list: it is to show where every
// prospect stands. A tab per column was a way of reading a board without
// drawing one.
//
// READ ONLY, and read LIVE, for the same reason the Sales board is: the cards
// are moved by the dialer and by Jake's own workflows, and a second place to
// drag them is how a pipeline starts disagreeing with itself. A card links out
// to the contact in the CRM instead of offering to move it.
//
// Structurally SalesPipelineBoard.tsx: dot + name + count header, a rounded
// well of cards, a slider under the columns that overflow. The same board type
// deserves the same board.
export default function ColdCallPipeline() {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Read once per render pass so every "2d ago" is measured from one instant.
  const now = Date.now();

  // Two reads of one endpoint: the first names the boards, the second fills the
  // one that is ours. Which board that is comes from the same picker the server
  // syncs prospects out of, so this page and that sync can never disagree about
  // what "the cold calling pipeline" means.
  const list = useAgencyPipelinesQuery();
  const board = useMemo(
    () => pickColdCallPipeline(list.data?.pipelines ?? []),
    [list.data],
  );
  const cards = useAgencyPipelinesQuery(board?.id, Boolean(board?.id));

  const columns = useMemo(
    () => (board ? groupByStage(board.stages, cards.data?.opportunities ?? []) : []),
    [board, cards.data],
  );

  const locationId = cards.data?.locationId ?? list.data?.locationId ?? "";

  if (list.isLoading) return <div className="pk-empty">Reading the board...</div>;
  if (list.isError || cards.isError) {
    return (
      <div className="pk-empty">
        Could not read the cold calling board from GoHighLevel. Reload to try again.
      </div>
    );
  }
  if (list.data && !list.data.configured) {
    return (
      <div className="pk-needs">
        The agency GoHighLevel account is not connected, so there is no board to read.
      </div>
    );
  }
  if (!board) {
    return (
      <div className="pk-empty">
        No board in that account looks like the Cold Calling pipeline. It is matched by its
        stages, so a rebuilt board needs its names checking under Management &gt; Stage check.
      </div>
    );
  }

  // Structure arrives before the cards do. Saying "Empty" in every column while
  // the fetch is still out reads as a board with nobody on it.
  const filled = cards.data?.opportunities !== undefined;

  return (
    <div>
      {cards.data?.truncated && (
        <p className="mb-4 text-[12px] font-semibold text-[var(--warning)]">
          Showing the first 500 prospects on this board. There are more than are shown here.
        </p>
      )}

      <div className="pt-1">
        <div ref={scrollRef} className="no-scrollbar flex items-start gap-3 overflow-x-auto pb-2">
          {columns.map((column) => {
            const tone = toneFor(column.name);
            return (
              <section key={column.id} className="flex w-[280px] shrink-0 flex-col gap-2">
                <header className="flex items-baseline justify-between gap-2 px-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: tone }}
                      aria-hidden
                    />
                    <span
                      className="truncate font-display text-[14px] font-bold text-text"
                      title={column.name}
                    >
                      {column.name}
                    </span>
                  </span>
                  <span
                    className="font-data shrink-0 rounded-full px-1.5 text-[12px] font-bold"
                    style={{
                      color: tone,
                      background: `color-mix(in srgb, ${tone} 12%, transparent)`,
                    }}
                  >
                    {filled ? column.cards.length : "-"}
                  </span>
                </header>

                <div
                  className="flex min-h-[96px] flex-col gap-2 rounded-2xl bg-surface-2 p-2"
                  style={{ boxShadow: `inset 0 3px 0 ${tone}` }}
                >
                  {column.cards.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[12px] text-faint">
                      {filled ? "Nothing in this stage." : "Reading..."}
                    </p>
                  ) : (
                    column.cards.map((card) => (
                      <ProspectCard
                        key={card.id}
                        card={card}
                        tone={tone}
                        locationId={locationId}
                        now={now}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {/* Draggable slider mirroring the board's horizontal scroll, so the
            off-screen stages are obviously reachable. Renders nothing when
            every column already fits. */}
        <BoardScrollbar scrollRef={scrollRef} className="px-1 pt-1" />
      </div>
    </div>
  );
}

// The column's colour. The console's own swatch when this is a stage it knows,
// so the board and the status pills elsewhere paint one stage one colour; the
// name-derived tone otherwise, which is what an added or renamed column gets.
function toneFor(stageName: string): string {
  const key = stageName.trim().toLowerCase();
  const known = COLD_CALL_STAGES.find((s) => s.label.toLowerCase() === key);
  return known?.swatch ?? stageTone(stageName);
}

// One prospect. It opens the contact in GoHighLevel and does nothing else: this
// board writes nothing, so the card's only action is the one that hands you to
// the place where changing it is allowed.
function ProspectCard({
  card,
  tone,
  locationId,
  now,
}: {
  card: AgencyPipelineCard;
  tone: string;
  locationId: string;
  now: number;
}) {
  const href = card.contactId ? ghlContactUrl(locationId, card.contactId) : null;
  const moved = card.updatedAt ? timeAgo(card.updatedAt, now) : "";

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold text-text" title={card.name}>
          {card.name}
        </span>
        {href && <ExternalLink size={12} aria-hidden className="mt-0.5 shrink-0 text-faint" />}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
        {card.phone && (
          <span className="font-data inline-flex items-center gap-1 text-text">
            <Phone size={11} aria-hidden className="text-faint" />
            {card.phone}
          </span>
        )}
        {moved && <span className="text-faint">{moved}</span>}
      </div>
    </>
  );

  const className =
    "block rounded-xl bg-surface p-2.5 text-left transition-colors hover:bg-surface-2";
  const style = { boxShadow: `inset 2px 0 0 ${tone}` };

  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      style={style}
      title="Open this contact in GoHighLevel"
    >
      {body}
    </a>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
