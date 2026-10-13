import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Trash2 } from "lucide-react";
import { Button } from "../../ui/Button";
import DeleteDialog from "./DeleteDialog";
import SoftwareDialog from "./SoftwareDialog";
import {
  useAdminOnboardingDriveFolder,
  useAdminOnboardingGoLive,
  useAdminOnboardingListQuery,
  useAdminOnboardingRemove,
} from "../../../hooks/useApi";
import { useFillClientDocs } from "../../../hooks/useSopApi";
import type { AdminOnboardingListItem } from "../../../lib/api";
import { bundleLabel, dialerLabel } from "../../../lib/onboardingWizard";

// The buttons that used to head Setup Checklist, now on Full Setup Checklist
// (Jake, 2026-10-13: Setup Checklist removed). Software setup (a pop-up,
// SoftwareDialog), Create client folder (clientDriveFolder.ts), Go live and
// Delete.
//
// Go live is never locked (Jake, 2026-08-15): the judgement of when a client is
// ready is his, not a count's. Delete wipes the onboarding record and marks the
// client 'removed' (account untouched, see remove.ts), then goes back to the
// agency, because the sub-account you were standing in is no longer listed.
// Nothing shows for a client with no onboarding record.

export default function SetupActions({ tenantId, home }: { tenantId: string; home: string }) {
  const roster = useAdminOnboardingListQuery();
  const client = (roster.data?.clients ?? []).find((c) => c.id === tenantId);
  if (!client) return null;
  return <Actions key={client.id} client={client} home={home} />;
}

function Actions({ client, home }: { client: AdminOnboardingListItem; home: string }) {
  const goLive = useAdminOnboardingGoLive(client.id);
  const remove = useAdminOnboardingRemove();
  const navigate = useNavigate();
  const [software, setSoftware] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const removeError = remove.error as Error | null;

  return (
    <>
      <SoftwareButton client={client} onOpen={() => setSoftware(true)} />
      <FolderButton client={client} />
      {goLive.isError && (
        <span className="text-[12px] font-medium text-danger">
          {(goLive.error as Error)?.message ?? "That did not work."}
        </span>
      )}
      <Button size="sm" variant="primary" loading={goLive.isPending} onClick={() => goLive.mutate()}>
        Go live
      </Button>
      <button
        type="button"
        onClick={() => {
          remove.reset();
          setDeleting(true);
        }}
        aria-label={`Delete ${client.name}`}
        title="Delete"
        className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] border border-border bg-surface text-faint transition-colors hover:border-danger/40 hover:text-danger"
      >
        <Trash2 size={14} aria-hidden />
      </button>

      {software && <SoftwareDialog client={client} onClose={() => setSoftware(false)} />}
      {deleting && (
        <DeleteDialog
          name={client.name}
          pending={remove.isPending}
          error={removeError ? removeError.message || "That did not work." : null}
          onConfirm={() => remove.mutate(client.id, { onSuccess: () => navigate(home, { replace: true }) })}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  );
}

// Grey until submitted, then grey with a green ticked box: done, and still
// clickable to change an answer.
function SoftwareButton({ client, onOpen }: { client: AdminOnboardingListItem; onOpen: () => void }) {
  if (!client.softwareLiveAt) {
    return (
      <Button variant="secondary" size="sm" onClick={onOpen}>
        Software setup
      </Button>
    );
  }
  const since = new Date(client.softwareLiveAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Live since ${since}: ${bundleLabel(client.bundle)}, ${dialerLabel(client.dialer)}`}
      aria-label={`Software setup, live since ${since}. Open to change.`}
      className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 text-[13px] font-medium text-faint transition-colors hover:text-muted"
    >
      <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-positive text-white">
        <Check size={11} strokeWidth={3.2} aria-hidden />
      </span>
      Software setup
    </button>
  );
}

// Same two looks as SoftwareButton. Once the folder exists the button opens it;
// a doc that failed to copy is named beside it until the page reloads.
function FolderButton({ client }: { client: AdminOnboardingListItem }) {
  const create = useAdminOnboardingDriveFolder(client.id);
  // Fill in docs (2026-10-06): the company name into the copied docs. The
  // folder button already does it for new folders; this is for older ones.
  const fill = useFillClientDocs(client.id);
  const problem = create.isError
    ? ((create.error as Error)?.message ?? "That did not work.")
    : fill.isError
      ? ((fill.error as Error)?.message ?? "That did not work.")
      : (create.data?.warning ?? fill.data?.problems[0]);

  return (
    <>
      {problem && <span className="text-[12px] font-medium text-danger">{problem}</span>}
      {client.driveFolderUrl ? (
        <>
          <a
            href={client.driveFolderUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Client folder, created. Open in Google Drive."
            className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 text-[13px] font-medium text-faint transition-colors hover:text-muted"
          >
            <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-positive text-white">
              <Check size={11} strokeWidth={3.2} aria-hidden />
            </span>
            Client folder
          </a>
          <Button variant="secondary" size="sm" loading={fill.isPending} onClick={() => fill.mutate()}>
            {fill.data ? `Filled ${fill.data.spots} in ${fill.data.docs} docs` : "Fill in docs"}
          </Button>
        </>
      ) : (
        <Button variant="secondary" size="sm" loading={create.isPending} onClick={() => create.mutate()}>
          Create client folder
        </Button>
      )}
    </>
  );
}
