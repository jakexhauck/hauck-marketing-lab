// How often an open Cold SMS / Sales board re-reads GHL (Jake, 2026-10-14).
// Without it a booking made in GHL or another window left the card on screen
// until the next page load or tab switch, which read as "it did not save".
export const BOARD_REFRESH_MS = 30_000;

// First page per column on the all-days board (STAGE_PAGE in coldSmsAgency.ts).
const FIRST_PAGE = 50;

type BoardShape = { day?: string; stages?: { cards: unknown[] }[] };

// The interval for one board, or false to stop re-reading it.
//
// Stopped once a column has been paged with Load more: a re-read returns first
// pages only and would drop the cards just loaded. A day view is never paged, so
// it always re-reads. (A read during a move is held back in the query itself,
// see useColdSmsBoardQuery.)
export function boardRefreshInterval(board: BoardShape | undefined): number | false {
  if (board && !board.day && board.stages?.some((s) => s.cards.length > FIRST_PAGE)) return false;
  return BOARD_REFRESH_MS;
}
