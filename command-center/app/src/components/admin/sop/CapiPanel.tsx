import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useCapiQuery, useRevealCapiToken, useSaveCapi, useTestCapi } from "../../../hooks/useSopApi";
import { CopyButton, SOP_FIELD, SopButton, SopCard, SopError, SopHeading } from "./sopKit";

// Client > GHL > CAPI. The two values the Client Setup SOP used to paste into a
// Google Doc: the Meta Dataset ID and its access token. Saving also writes them
// into the client's GHL custom values (server side). The token comes back
// masked; Show fetches it once, and that fetch is audit-logged.

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function CapiPanel({ tenantId }: { tenantId: string }) {
  const q = useCapiQuery(tenantId);
  const save = useSaveCapi(tenantId);
  const reveal = useRevealCapiToken(tenantId);
  const test = useTestCapi(tenantId);

  const [datasetId, setDatasetId] = useState("");
  const [token, setToken] = useState("");
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (q.data) setDatasetId(q.data.datasetId);
  }, [q.data]);

  if (q.isLoading) return <div className="pk-empty">Loading...</div>;
  if (q.isError || !q.data) return <div className="pk-empty">CAPI did not load.</div>;
  const view = q.data;
  const fullToken = shown ? (reveal.data?.token ?? "") : "";

  const submit = () => {
    const input: { datasetId?: string; accessToken?: string } = {};
    if (datasetId.trim() !== view.datasetId) input.datasetId = datasetId.trim();
    if (token.trim()) input.accessToken = token.trim();
    if (Object.keys(input).length === 0) return;
    save.mutate(input, {
      onSuccess: () => {
        setToken("");
        setShown(false);
        reveal.reset();
      },
    });
  };

  const ghl = save.data?.ghl;

  return (
    <SopCard className="max-w-[760px]">
      <SopHeading right={view.updatedAt ? <span className="text-[12.5px] text-faint">Saved {when(view.updatedAt)}</span> : null}>
        CAPI
      </SopHeading>

      <label className="mb-1 block text-[12.5px] font-medium text-muted" htmlFor="capi-dataset">
        Dataset ID
      </label>
      <div className="mb-4 flex items-center gap-2">
        <input
          id="capi-dataset"
          className={SOP_FIELD}
          inputMode="numeric"
          value={datasetId}
          onChange={(e) => setDatasetId(e.target.value)}
        />
        <CopyButton text={view.datasetId} />
      </div>

      <label className="mb-1 block text-[12.5px] font-medium text-muted" htmlFor="capi-token">
        Access Token
      </label>
      {view.hasToken && (
        <div className="mb-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-[var(--radius)] bg-surface-2 px-3 py-2 font-data text-[12.5px] text-text">
            {shown ? fullToken || "..." : view.token}
          </code>
          <SopButton
            onClick={() => {
              if (shown) {
                setShown(false);
                return;
              }
              setShown(true);
              if (!reveal.data) reveal.mutate();
            }}
          >
            {shown ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
            {shown ? "Hide" : "Show"}
          </SopButton>
          <CopyButtonForToken onCopy={async () => (reveal.data ?? (await reveal.mutateAsync())).token} />
        </div>
      )}
      <input
        id="capi-token"
        className={SOP_FIELD}
        placeholder={view.hasToken ? "Paste a new token to replace it" : "Paste the token"}
        value={token}
        onChange={(e) => setToken(e.target.value)}
        autoComplete="off"
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SopButton primary onClick={submit} disabled={save.isPending}>
          {save.isPending ? "Saving..." : "Save"}
        </SopButton>
        <SopButton onClick={() => test.mutate()} disabled={test.isPending || !view.hasToken || !view.datasetId}>
          {test.isPending ? "Testing..." : "Test"}
        </SopButton>
        {test.data && (
          <span className={test.data.ok ? "text-[12.5px] text-positive" : "text-[12.5px] text-danger"}>
            {test.data.ok ? `Works: ${test.data.name}` : test.data.error}
          </span>
        )}
        {ghl && (
          <span className="text-[12.5px] text-muted">
            {ghl.pushed && ghl.missing.length === 0 ? "Sent to GHL" : ghl.missing.length ? `Not in GHL: ${ghl.missing.join(", ")}` : "GHL did not take it"}
          </span>
        )}
      </div>
      <SopError error={save.error ?? reveal.error ?? test.error} />
    </SopCard>
  );
}

// Copy for a value the page does not hold yet: fetches it on click.
function CopyButtonForToken({ onCopy }: { onCopy: () => Promise<string> }) {
  const [text, setText] = useState("");
  if (text) return <CopyButton text={text} />;
  return (
    <SopButton
      onClick={() => {
        void onCopy().then((t) => {
          setText(t);
          void navigator.clipboard?.writeText(t);
        });
      }}
    >
      Copy
    </SopButton>
  );
}
