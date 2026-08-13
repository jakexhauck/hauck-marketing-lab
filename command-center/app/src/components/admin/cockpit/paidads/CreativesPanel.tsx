import { useState } from "react";
import CreativesFolderCard from "../../../ads/CreativesFolderCard";
import CreativesGrid from "../../../ads/CreativesGrid";
import CreativesWizard from "./CreativesWizard";
import SetupWizard from "./SetupWizard";
import { ErrorNote, Spinner } from "../../../../routes/paid-ads/trackerShared";
import { useAdminCreativesFolderQuery, useSetCreativesFolder } from "../../../../hooks/useApi";

// Paid Ads > Creatives, in the Fulfillment cockpit.
//
// Replaced Ad Library. That panel held two things: a mirror of the client's Meta
// media, and a creatives tracker whose draft/approved/live rows an operator
// typed by hand. The creatives themselves have always been made and kept in
// Drive, so the app stops holding a second copy and holds the address instead.
//
// This is the ONLY place the folder can be set. The client's own page reads the
// same mapping and cannot write it.

// The connect step is only ever shown once, ever, for the whole agency: the
// wizard itself skips it when the grant already exists. It is still named here
// so the operator who does hit it can see it is one of two, not the whole job.
const CREATIVES_STEPS = [
  { id: "drive", label: "Google Drive" },
  { id: "folder", label: "This client's folder" },
];

export default function CreativesPanel({ tenantId }: { tenantId: string }) {
  const query = useAdminCreativesFolderQuery(tenantId);
  const save = useSetCreativesFolder(tenantId);

  // The picker is hidden once a folder is set, so the common case (looking at
  // the creatives) is not buried under setup controls it no longer needs.
  const [changing, setChanging] = useState(false);

  if (query.isError) return <ErrorNote message={(query.error as Error | null)?.message} />;
  if (query.isLoading && !query.data) return <Spinner />;

  const url = query.data?.url ?? null;
  const saveError = save.isError
    ? ((save.error as Error | null)?.message ?? "Could not save that folder.")
    : null;

  const choose = (folderId: string) => {
    save.mutate({ folderId }, { onSuccess: () => setChanging(false) });
  };
  const paste = (folderUrl: string) => {
    save.mutate({ folderUrl }, { onSuccess: () => setChanging(false) });
  };

  // Shown while there is no folder, or when the operator asks to change one.
  const pickerOpen = !url || changing;

  // Before a folder is chosen there is nothing to look at, so the wizard is the
  // whole page rather than a card above an empty grid. Same shape as the ad
  // account wizard next door: a setup step that shares the screen with the
  // thing it is blocking reads as optional, and gets skipped.
  if (!url) {
    return (
      <SetupWizard
        title="Point Creatives at a Drive folder"
        steps={CREATIVES_STEPS}
        currentIndex={query.data?.connected === false ? 0 : 1}
      >
        <CreativesWizard
          tenantId={tenantId}
          saving={save.isPending}
          onChoose={choose}
          onPaste={paste}
          error={saveError}
        />
      </SetupWizard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CreativesFolderCard
        url={url}
        title="Ad creatives"
        description="This client's ad creatives live in Google Drive."
        emptyText="No Drive folder is set for this client yet. Choose one below."
      >
        {url && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setChanging((v) => !v)}
              className="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-text transition-colors hover:border-brand"
            >
              {changing ? "Cancel" : "Change folder"}
            </button>
            <button
              type="button"
              onClick={() => save.mutate({})}
              disabled={save.isPending}
              className="text-[12.5px] font-medium text-muted transition-colors hover:text-danger disabled:opacity-50"
            >
              Unlink
            </button>
            {saveError && !pickerOpen && <span className="text-[12px] text-danger">{saveError}</span>}
          </div>
        )}
      </CreativesFolderCard>

      {pickerOpen && (
        <CreativesWizard
          tenantId={tenantId}
          saving={save.isPending}
          onChoose={choose}
          onPaste={paste}
          error={saveError}
        />
      )}

      <CreativesGrid
        files={query.data?.files ?? []}
        connected={query.data?.connected ?? false}
        error={query.data?.error ?? null}
        hasFolder={Boolean(url)}
        // The wizard already carries the connect button, so the grid must not
        // repeat the "not connected" notice underneath it.
        quiet={pickerOpen}
      />
    </div>
  );
}
