import { useEffect, useState } from "react";
import { Building2, Check, RefreshCw } from "lucide-react";
import { Button } from "../../ui/Button";
import {
  useAdminGhlConnectionQuery,
  useGhlAppQuery,
  useGhlLocationsQuery,
  useLinkSubaccount,
} from "../../../hooks/useApi";

// Sub-account: the one step that turns a signed-up client into a working app.
//
// A pick, not a paste. The old Wiring card asked for a location id and a
// Private Integration token typed in by hand, which is both tedious and the
// one mistake nobody catches: the wrong location id silently serves another
// client's leads under this client's name. The list here comes from the agency
// itself, the ones another client already holds cannot be chosen, and the link
// is proven against GoHighLevel before it is stored.
//
// Change works on a live client too, because the alternative was worse: every
// client was live, so Link could not be exercised at all and nobody could be
// moved onto the app. It is safe in the way that matters: Link never stores a
// sub-account it has not just read successfully, so a failed swap leaves the
// client exactly as it found them. A live client gets a confirm first, since
// this is their whole app's source of data.

interface Props {
  tenantId: string;
  clientName: string;
  // Live clients are warned before their sub-account moves. Clients still being
  // set up are not: nothing is reading them yet.
  isLive: boolean;
}

export default function SubaccountCard({ tenantId, clientName, isLive }: Props) {
  const app = useGhlAppQuery();
  const connection = useAdminGhlConnectionQuery(tenantId);
  const installed = app.data?.installed ?? false;
  const linkedId = connection.data?.locationId ?? "";
  const [changing, setChanging] = useState(false);
  const picking = !linkedId || changing;

  const locations = useGhlLocationsQuery(tenantId, installed && picking);
  const link = useLinkSubaccount(tenantId);

  const [chosen, setChosen] = useState("");

  // Switching client drops a half-made choice rather than carrying it onto
  // somebody else's record.
  useEffect(() => {
    setChosen("");
    setChanging(false);
    link.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // The suggestion fills the box, it does not make the choice: Link still has
  // to be pressed.
  useEffect(() => {
    const suggested = locations.data?.suggestedId;
    if (suggested && !chosen) setChosen(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations.data?.suggestedId]);

  const options = locations.data?.locations ?? [];
  const linkedName =
    connection.data?.locationName ?? options.find((o) => o.id === linkedId)?.name ?? null;

  const linkError = (link.error as Error | null)?.message ?? null;
  const result = link.data;
  const failures = [
    ...(result?.provision ?? []).filter((p) => p.outcome.startsWith("failed")).map((p) => p.name),
    ...(result?.customValues.failed ?? []).map((f) => f.name),
  ];

  const submit = () => {
    if (!chosen) return;
    const target = options.find((o) => o.id === chosen)?.name ?? chosen;
    if (
      isLive &&
      linkedId &&
      chosen !== linkedId &&
      !window.confirm(
        `Move ${clientName} to the "${target}" sub-account? They are live, so every page in their app reads it from now on.`,
      )
    ) {
      return;
    }
    link.mutate(chosen, { onSuccess: () => setChanging(false) });
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] bg-brand-tint text-brand-text"
          aria-hidden
        >
          <Building2 size={16} />
        </span>
        <h2 className="font-display text-[16.5px] font-semibold text-text">Sub-account</h2>
      </header>

      {app.isLoading || connection.isLoading ? (
        <p className="text-[13px] text-muted">Loading...</p>
      ) : !installed ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={!app.data?.installUrl}
            onClick={() => {
              if (app.data?.installUrl) window.location.href = app.data.installUrl;
            }}
          >
            Install app
          </Button>
          {!app.data?.installUrl && (
            <span className="text-[12.5px] font-medium text-danger">
              GHL_APP_CLIENT_ID is not set on this deployment.
            </span>
          )}
        </div>
      ) : picking ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Sub-account"
              value={chosen}
              disabled={locations.isLoading}
              onChange={(e) => setChosen(e.target.value)}
              className="min-w-[260px] rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[13px] text-text focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            >
              <option value="">Pick a sub-account</option>
              {options.map((o) => (
                <option
                  key={o.id}
                  value={o.id}
                  disabled={Boolean(o.linkedTenantId) && o.id !== linkedId}
                >
                  {o.linkedTenantId && o.id !== linkedId
                    ? `${o.name} (${o.linkedTenantName})`
                    : o.name}
                </option>
              ))}
            </select>

            <Button variant="primary" disabled={!chosen} loading={link.isPending} onClick={submit}>
              Link
            </Button>

            <Button
              variant="ghost"
              disabled={locations.isFetching}
              onClick={() => void locations.refetch()}
            >
              Refresh
            </Button>

            {changing && (
              <Button variant="ghost" onClick={() => setChanging(false)}>
                Cancel
              </Button>
            )}

            {locations.isFetching && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                <RefreshCw size={13} className="animate-spin" aria-hidden />
                Reading GoHighLevel...
              </span>
            )}
          </div>

          {locations.isError && (
            <span className="text-[12.5px] font-medium text-danger">
              {(locations.error as Error)?.message ?? "That list did not load."}
            </span>
          )}
          {linkError && <span className="text-[12.5px] font-medium text-danger">{linkError}</span>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-positive">
              <Check size={13} aria-hidden />
              Linked
            </span>
            <span className="text-[13px] font-medium text-text">{linkedName ?? "Sub-account"}</span>
            <span className="font-mono text-[12px] text-faint">{linkedId}</span>
            <Button
              variant="ghost"
              onClick={() => {
                setChosen(linkedId);
                setChanging(true);
              }}
            >
              Change
            </Button>
          </div>

          {connection.data && !connection.data.connected && (
            <span className="text-[12.5px] font-medium text-danger">
              {connection.data.error ?? "GoHighLevel is refusing this sub-account."}
            </span>
          )}
          {failures.length > 0 && (
            <span className="text-[12.5px] font-medium text-danger">
              Did not write: {failures.join(", ")}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
