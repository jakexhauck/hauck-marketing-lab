import { useWiringQuery } from "../../../hooks/useSopApi";
import { CopyButton, SopCard, SopError, SopHeading } from "./sopKit";
import { ownerLinkText } from "../../../lib/ownerLinkText";

// Client > GHL > Outcome Wiring. The three owner links (Call Now, Lead Outcome, Phone
// Appointment Call Now) with this client's key in them and the lead's contact id
// on the end (lib/ownerLinkText.ts), for pasting into a GHL Trigger Link by hand
// (Jake, 2026-10-12). Linking the sub-account and Provision still write the same
// three as custom values, so texts already sent keep working.

export default function WiringPanel({ tenantId }: { tenantId: string }) {
  const q = useWiringQuery(tenantId);

  if (q.isLoading) return <div className="pk-empty">Loading...</div>;
  if (q.isError || !q.data) {
    return (
      <SopCard className="max-w-[760px]">
        <SopHeading>Outcome Wiring</SopHeading>
        <SopError error={q.error ?? new Error("Wiring did not load.")} />
      </SopCard>
    );
  }
  if (q.data.links.length === 0) return <div className="pk-empty">Link the sub-account first.</div>;

  return (
    <SopCard className="max-w-[760px]">
      <SopHeading>Outcome Wiring</SopHeading>
      <div className="flex flex-col gap-5">
        {q.data.links.map((l) => (
          <div key={l.name}>
            <div className="mb-1 text-[13.5px] font-semibold text-text">{l.name}</div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[var(--radius)] bg-surface-2 px-3 py-2 font-data text-[12.5px] text-text" title={ownerLinkText(l.value)}>
                {ownerLinkText(l.value)}
              </code>
              <CopyButton text={ownerLinkText(l.value)} />
            </div>
          </div>
        ))}
      </div>
    </SopCard>
  );
}
