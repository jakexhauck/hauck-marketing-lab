import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import CreativesFolderCard from "../../components/ads/CreativesFolderCard";
import CreativesGrid from "../../components/ads/CreativesGrid";
import { PAID_ADS_CONTAINER } from "./shared";
import { useAuth } from "../../context/AuthContext";
import { useAdsCreativesFolderQuery } from "../../hooks/useApi";
import { ErrorNote, Spinner } from "./trackerShared";

// Paid Ads > Creatives. Where this client's ad creatives live in Drive.
//
// Read only, and deliberately so: the folder is chosen by an operator in the
// cockpit. A client repointing themselves is not a feature, it is a way to see
// somebody else's creatives.
//
// The empty state says the plain truth and offers nothing. It does not say
// "your creatives will appear here", because a connected client reading filler
// about a thing that is not set up is worse than being told it is not set up.

export default function AdsCreatives() {
  const { session } = useAuth();
  const query = useAdsCreativesFolderQuery(Boolean(session));

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar tabs={[]} section="Creatives" />

        {query.isError ? (
          <ErrorNote message={(query.error as Error | null)?.message} />
        ) : query.isLoading && !query.data ? (
          <Spinner />
        ) : (
          <>
            <CreativesFolderCard
              url={query.data?.url ?? null}
              title="Ad creatives"
              description="Your ad creatives live in Google Drive. Open the folder to add your own, or click any one below."
              emptyText="Your creatives folder has not been set up yet. We will add it shortly."
            />
            <CreativesGrid
              files={query.data?.files ?? []}
              connected={query.data?.connected ?? false}
              error={query.data?.error ?? null}
              hasFolder={Boolean(query.data?.folderId)}
            />
          </>
        )}
      </div>
    </Shell>
  );
}
