import { PhoneCall } from "lucide-react";
import { Switch } from "../../ui/Switch";
import { useSelfDialQuery, useSetSelfDial } from "../../../hooks/useApi";

// Does this client ring their own leads? On: their Leads page lists every lead
// that submitted and the owner marks what happened on each, their Inbox shows
// the ad leads, and the Lead Tracker status becomes the one they typed. Off: we
// dial, the Leads page is the hand-off board. See functions/lib/selfDial.ts.
//
// Heading plus the switch, nothing else (Jake's no-sub-text rule).

export default function SelfDialCard({ tenantId }: { tenantId: string }) {
  const query = useSelfDialQuery(tenantId);
  const set = useSetSelfDial(tenantId);
  const on = set.isPending ? set.variables === true : query.data?.on === true;

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <header className="flex items-center gap-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] bg-brand-tint text-brand-text"
          aria-hidden
        >
          <PhoneCall size={16} />
        </span>
        <h2 className="flex-1 font-display text-[16.5px] font-semibold text-text">
          Client dials own leads
        </h2>
        {query.isError ? (
          <span className="text-[12.5px] font-medium text-danger">Did not load</span>
        ) : (
          <Switch
            checked={on}
            disabled={query.isLoading || set.isPending}
            onChange={(next) => set.mutate(next)}
            label="Client dials own leads"
          />
        )}
      </header>
      {set.isError && (
        <p className="mt-3 text-[12.5px] font-medium text-danger">
          {(set.error as Error).message || "That did not save."}
        </p>
      )}
    </section>
  );
}
