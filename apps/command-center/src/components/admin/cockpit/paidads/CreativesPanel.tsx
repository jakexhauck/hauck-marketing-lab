import CreativeUploader from "./CreativeUploader";
import CreativeLibrary from "./CreativeLibrary";
import CreativeFilesSection from "./CreativeFilesSection";
import { ErrorNote, Spinner } from "../../../../routes/paid-ads/trackerShared";
import { useAdminCreativeLibrary } from "../../../../hooks/useApi";

// Paid Ads > Creatives, in the Fulfillment cockpit.
//
// Two separate jobs. Creatives is what the client sees on their own Creatives
// page: files uploaded here and played in the app. It replaced a Drive folder,
// whose bytes Composio could list but never move, so a client could never open
// one without leaving the app. Upload to Meta sends files to the client's ad
// account library and is untouched by it: dropping a creative in one does not
// send it to the other.
export default function CreativesPanel({
  tenantId,
  adAccountId,
}: {
  tenantId: string;
  adAccountId: string | null;
}) {
  const linked = Boolean((adAccountId ?? "").trim());
  const library = useAdminCreativeLibrary(tenantId, linked);
  const libraryItems = library.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <CreativeFilesSection tenantId={tenantId} />
      <CreativeUploader tenantId={tenantId} library={libraryItems} disabled={!linked} />
      {linked &&
        (library.isError ? (
          <ErrorNote message={(library.error as Error | null)?.message} />
        ) : library.isLoading ? (
          <Spinner />
        ) : (
          <CreativeLibrary items={libraryItems} />
        ))}
    </div>
  );
}
