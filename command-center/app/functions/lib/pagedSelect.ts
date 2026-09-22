// Read EVERY row of a Supabase query, one PostgREST page at a time.
//
// PostgREST caps a single read at 1000 rows (the project's max-rows) and says
// nothing when it does: no error, no header the client checks, just a shorter
// array. `.limit(5000)` does not lift it. So a table that grows past 1000 rows
// for one client starts returning a quietly partial answer, and every total
// built on it is wrong by exactly the rows that fell off the end.
//
// meta_ad_days was the case that mattered: one row per ad per day, read whole
// by the Paid Ads dashboard. Willis sat at 183 rows on 2026-09-22, which is how
// this stayed invisible. It would not have stayed that way.
//
// The caller builds the query and MUST give it a total order (e.g. by date then
// id), or rows can shift between pages and be read twice or not at all.

type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

export const PAGE_SIZE = 1000;

export async function selectAllPages<T>(
  page: (from: number, to: number) => PageResult,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}
