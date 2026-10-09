import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import CreativesGrid from "../../components/ads/CreativesGrid";
import { PAID_ADS_CONTAINER } from "./shared";
import { useAuth } from "../../context/AuthContext";
import { useAdsCreativeFilesQuery } from "../../hooks/useApi";
import { ErrorNote, Spinner } from "./trackerShared";

// Paid Ads > Creatives. The ad creatives the agency has uploaded for this
// client, opened and played in the app.
//
// Read only: uploading and deleting happen in the admin cockpit.

export default function AdsCreatives() {
  const { session } = useAuth();
  const query = useAdsCreativeFilesQuery(Boolean(session));

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar tabs={[]} section="Creatives" />

        {query.isError ? (
          <ErrorNote message={(query.error as Error | null)?.message} />
        ) : query.isLoading && !query.data ? (
          <Spinner />
        ) : (
          <div className="mt-5">
            <CreativesGrid files={query.data?.files ?? []} />
          </div>
        )}
      </div>
    </Shell>
  );
}
