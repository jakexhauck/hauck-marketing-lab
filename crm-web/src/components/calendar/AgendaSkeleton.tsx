import { Panel, Skeleton } from "@/components/ui";

// Loading placeholder that mirrors the agenda shape: two day groups, each a
// header line over a few time + detail rows, so the layout doesn't jump when
// real data lands.
export function AgendaSkeleton() {
  return (
    <div className="space-y-7">
      {[0, 1].map((g) => (
        <div key={g}>
          <Skeleton className="mb-2 h-4 w-28" />
          <Panel className="divide-y divide-divider overflow-hidden">
            {[0, 1, 2].map((r) => (
              <div
                key={r}
                className="grid grid-cols-1 gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[5.5rem_1fr]"
              >
                <Skeleton className="h-4 w-14" />
                <div className="space-y-2.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </Panel>
        </div>
      ))}
    </div>
  );
}
