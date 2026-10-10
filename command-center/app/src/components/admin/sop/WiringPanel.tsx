import { useWiringQuery } from "../../../hooks/useSopApi";
import { CopyButton, SopCard, SopError, SopHeading } from "./sopKit";

// Client > GHL > Wiring. The three owner links (Call Now, Lead Outcome,
// Estimate Outcome) with this client's key in them, each beside the custom
// value it belongs in, for pasting into GHL by hand. Push on Custom Values
// writes the same three; this is for when Jake wants to see or copy them.

export default function WiringPanel({ tenantId }: { tenantId: string }) {
  const q = useWiringQuery(tenantId);

  if (q.isLoading) return <div className="pk-empty">Loading...</div>;
  if (q.isError || !q.data) {
    return (
      <SopCard className="max-w-[760px]">
        <SopHeading>Wiring</SopHeading>
        <SopError error={q.error ?? new Error("Wiring did not load.")} />
      </SopCard>
    );
  }
  if (q.data.links.length === 0) return <div className="pk-empty">Link the sub-account first.</div>;

  return (
    <SopCard className="max-w-[760px]">
      <SopHeading>Wiring</SopHeading>
      <div className="flex flex-col gap-5">
        {q.data.links.map((l) => (
          <div key={l.name}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-semibold text-text">{l.name}</span>
              <span className="flex items-center gap-1.5">
                <code className="font-data text-[12px] text-faint">{l.merge}</code>
                <CopyButton text={l.merge} label="Copy tag" />
              </span>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[var(--radius)] bg-surface-2 px-3 py-2 font-data text-[12.5px] text-text" title={l.value}>
                {l.value}
              </code>
              <CopyButton text={l.value} />
            </div>
          </div>
        ))}
      </div>
    </SopCard>
  );
}
