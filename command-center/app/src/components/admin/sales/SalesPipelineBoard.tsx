import { useMemo, useRef } from "react";
import { ExternalLink } from "lucide-react";
import BoardScrollbar from "../../BoardScrollbar";
import { useSalesPipelineQuery } from "../../../hooks/useSalesCalls";
import { ghlContactUrl, stageTone } from "../../../lib/setterModel";
import { formatMoneyExact } from "../../../lib/formatMoney";
import { timeAgo } from "../../../lib/timeAgo";
import { STALE_AFTER_DAYS, daysStill, isStale } from "../../../../functions/lib/salesPipeline";
import type { AgencyPipelineCard } from "../../../lib/api";

// Sales > Sales Pipeline: the agency's own Sales board in GoHighLevel, drawn as
// a board.
//
// Sales Calls is the page with a job on it. This is the page you look at: where
// every meeting the agency has run currently stands, in the columns Jake reads
// in the CRM, with the stage names taken verbatim so this page and that account
// can never describe the same deal differently.
//
// READ ONLY, deliberately. Cards here are moved by Jake's own workflows, which
// fire on the tags the Sales Calls buttons apply, and by his own hands in
// GoHighLevel. A second place to drag them is how a pipeline starts disagreeing
// with itself, so a card links out to the contact in the CRM instead of
// offering to move it.
//
// Structurally the Setter Suite board (SetterBoard.tsx): a dot + name + count
// header, a rounded well of cards, a slider under the columns that overflow.
// The same board type deserves the same board.

export default function SalesPipelineBoard() {
  const query = useSalesPipelineQuery();
  const data = query.data;
  const scrollRef = useRef<HTMLDivElement>(null);
  // Read once per render pass so every "2d ago" on the board is measured from
  // the same instant.
  const now = Date.now();

  const columns = useMemo(() => data?.columns ?? [], [data]);

  if (query.isLoading) return <div className="pk-empty">Reading the board...</div>;
  if (query.isError) {
    return (
      <div className="pk-empty">
        Could not read the Sales board from GoHighLevel. Reload to try again.
      </div>
    );
  }

  return (
    <div>
      <StatusLine
        configured={data?.configured ?? false}
        pipeline={data?.pipeline ?? null}
        truncated={data?.truncated ?? false}
      />

      {columns.length === 0 ? (
        <div className="pk-empty">
          {data?.configured && data.pipeline
            ? "That board has no stages, so there is nothing to draw."
            : "No Sales board to show."}
        </div>
      ) : (
        <div className="pt-1">
          <div ref={scrollRef} className="no-scrollbar flex items-start gap-3 overflow-x-auto pb-2">
            {columns.map((column) => {
              // Semantic tone from the stage NAME, ignoring the CRM's own
              // stage.color: GHL only sets it on some stages and its values are
              // not reliably valid CSS. One rule, every column coloured.
              const tone = stageTone(column.name);
              const stale = column.cards.filter((c) => isStale(c, now)).length;
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
                    <span className="flex shrink-0 items-baseline gap-1">
                      {/* How many of this column's deals have gone quiet. Only
                          when there are any: a "0 stale" badge on every column
                          would be noise on a board that is behaving. */}
                      {stale > 0 && (
                        <span
                          className="font-data rounded-full px-1.5 text-[12px] font-bold"
                          style={{
                            color: "var(--warning)",
                            background: "color-mix(in srgb, var(--warning) 14%, transparent)",
                          }}
                          title={`${stale} ${stale === 1 ? "deal has" : "deals have"} not moved in ${STALE_AFTER_DAYS} days`}
                        >
                          {stale} stale
                        </span>
                      )}
                      <span
                        className="font-data rounded-full px-1.5 text-[12px] font-bold"
                        style={{
                          color: tone,
                          background: `color-mix(in srgb, ${tone} 12%, transparent)`,
                        }}
                      >
                        {column.cards.length}
                      </span>
                    </span>
                  </header>

                  <div
                    className="flex min-h-[96px] flex-col gap-2 rounded-2xl bg-surface-2 p-2"
                    style={{ boxShadow: `inset 0 3px 0 ${tone}` }}
                  >
                    {column.cards.length === 0 ? (
                      <p className="px-2 py-6 text-center text-[12px] text-faint">
                        Nothing in this stage.
                      </p>
                    ) : (
                      column.cards.map((card) => (
                        <DealCard
                          key={card.id}
                          card={card}
                          tone={tone}
                          locationId={data?.locationId ?? ""}
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
      )}
    </div>
  );
}

// One deal. It opens the contact in GoHighLevel and does nothing else: this
// board writes nothing, so the card's only action is the one that hands you to
// the place where changing it is allowed.
function DealCard({
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
  // Open, and nothing has happened to it in a fortnight.
  const stale = isStale(card, now);
  const still = daysStill(card.updatedAt, now);

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold text-text" title={card.name}>
          {/* The dot leads the name rather than sitting in the meta line: the
              point of it is to be seen while scanning a column, not found while
              reading a card. */}
          {stale && (
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
              style={{ background: "var(--warning)" }}
              aria-hidden
            />
          )}
          {card.name}
        </span>
        {href && (
          <ExternalLink size={12} aria-hidden className="mt-0.5 shrink-0 text-faint" />
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
        {/* Value only when the card carries one. A deal with no figure in the
            CRM shows nothing here rather than $0, which would read as a sale
            worth nothing instead of a number nobody has filled in. */}
        {card.value !== null && (
          <span className="font-data font-semibold text-text">
            {formatMoneyExact(card.value)}
          </span>
        )}
        {card.status !== "open" && <StatusPill status={card.status} />}
        {/* A stale card says how long in words instead of "24d ago", because the
            number is the complaint. Everything else keeps the quiet relative
            time it had. */}
        {stale && still !== null ? (
          <span className="font-semibold text-[var(--warning)]">
            {still} days, no movement
          </span>
        ) : (
          moved && <span className="text-faint">{moved}</span>
        )}
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

// Won and lost, said plainly. GoHighLevel tracks these separately from the
// column, and a New Client card still sitting at status open is a sale that
// never reaches a report, so the board shows the status rather than assuming
// the column implies it.
function StatusPill({ status }: { status: string }) {
  const won = status === "won";
  const color = won ? "var(--positive)" : "var(--danger)";
  return (
    <span
      className="rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {won ? "Won" : status === "lost" ? "Lost" : status}
    </span>
  );
}

// What this board is, and anything that makes what is on it mean less than it
// looks. Same job as the Sales Calls status line, and for the same reason: a
// board that quietly failed to reach the CRM looks exactly like a quiet week.
//
// No refresh button. The board keeps itself in step (useSalesPipelineQuery
// polls and refetches on focus), so a button would only ever do what the page
// was about to do anyway, while implying the numbers wait for a click.
function StatusLine({
  configured,
  pipeline,
  truncated,
}: {
  configured: boolean;
  pipeline: { id: string; name: string; missing: string[] } | null;
  truncated: boolean;
}) {
  const warnings: string[] = [];

  if (!configured) {
    warnings.push(
      "The agency GoHighLevel account is not connected, so there is no board to read.",
    );
  } else if (!pipeline) {
    warnings.push(
      "No Sales board was found in GoHighLevel. It is matched by name, so a renamed board needs the name adding in functions/lib/salesPipeline.ts.",
    );
  } else if (pipeline.missing.length > 0) {
    warnings.push(
      `This board has no ${pipeline.missing.join(" or ")} stage, so a workflow has nowhere to move that outcome to.`,
    );
  }

  if (truncated) {
    warnings.push("Showing the first 500 deals on this board. There are more than are shown here.");
  }

  // Nothing here about deals that have gone quiet. That was a warning about the
  // SELLING rather than about the connection, and this row is only for the
  // second kind: a line saying the board cannot be trusted. Each column still
  // badges its own stale count, on the board, next to the cards it is about.

  // Only when something is wrong. The line that used to lead this row named the
  // board, said it was live from GoHighLevel, and totalled the deals: three
  // facts the board underneath already shows, restated above it on every load.
  // With nothing to warn about there is nothing to say, and an empty row would
  // still draw its own bottom margin.
  if (warnings.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      {warnings.map((w) => (
        <span key={w} className="text-[12px] font-semibold text-[var(--warning)]">
          {w}
        </span>
      ))}
    </div>
  );
}
