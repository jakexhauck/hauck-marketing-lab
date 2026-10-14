import { useWiringQuery } from "../../../hooks/useSopApi";
import { CopyButton, SopCard, SopError, SopHeading } from "./sopKit";
import { NEW_LEAD_TEXT, ownerLinkText } from "../../../lib/ownerLinkText";

// Client > GHL > Outcome Wiring. The new-lead text to paste into the owner
// workflow, then the Open Lead custom value with this client's key in it, for
// pasting into GHL by hand. The tag is copied with the lead's contact id on the
// end (lib/ownerLinkText.ts), the form the text needs. Linking the sub-account
// and Provision write the same value.

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
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-semibold text-text">New lead text</span>
            <CopyButton text={NEW_LEAD_TEXT} />
          </div>
          <pre className="whitespace-pre-wrap rounded-[var(--radius)] bg-surface-2 px-3 py-2 font-data text-[12.5px] text-text">{NEW_LEAD_TEXT}</pre>
        </div>
        {q.data.links.map((l) => (
          <div key={l.name}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-semibold text-text">{l.name}</span>
              <span className="flex items-center gap-1.5">
                <code className="font-data text-[12px] text-faint">{ownerLinkText(l.merge)}</code>
                <CopyButton text={ownerLinkText(l.merge)} label="Copy for text" />
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
