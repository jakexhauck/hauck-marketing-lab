import { Image as ImageIcon, Play, Film } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { Panel, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useAdsMedia, type AdMediaItem } from "../../hooks/useAdsMedia";
import { demoMode } from "../../demo/demoMode";
import { PAID_ADS_TABS } from "../../lib/pageTabs";
import { PAID_ADS_CONTAINER, NotConnectedNotice } from "./shared";

// "Media": the client's ad photo and video library, straight from Meta
// (/api/ads/media, read-only). Every asset shows here; the ones backing an ad
// that is running right now carry a green Live pill (resolved server-side). A
// real account with no media, or one whose token can't read the media edge yet,
// shows an honest empty state (never fabricated media). The demo view renders a
// clearly-sampled gallery so the layout reads.

// Deterministic gradient placeholder for an item with no thumbnail, and for the
// demo sample tiles.
const THUMBS = [
  "linear-gradient(135deg,#4f46e5,#7c73f0 60%,#db2777)",
  "linear-gradient(135deg,#0ea5e9,#4f46e5)",
  "linear-gradient(135deg,#0f172a,#334155 70%,#0ea5e9)",
  "linear-gradient(135deg,#f59e0b,#db2777)",
  "linear-gradient(135deg,#16a34a,#0ea5e9)",
  "linear-gradient(135deg,#7c73f0,#2563eb)",
];

const DEMO_ITEMS: AdMediaItem[] = [
  { id: "m1", type: "image", url: "", thumbnail: "", name: "Water heater hero", live: true },
  { id: "m2", type: "video", url: "", thumbnail: "", name: "Tech intro reel", live: true },
  { id: "m3", type: "image", url: "", thumbnail: "", name: "AC tune-up offer", live: false },
  { id: "m4", type: "image", url: "", thumbnail: "", name: "5-star review card", live: false },
  { id: "m5", type: "video", url: "", thumbnail: "", name: "Before / after", live: false },
  { id: "m6", type: "image", url: "", thumbnail: "", name: "Team on the job", live: false },
];

function MediaTile({ item, index }: { item: AdMediaItem; index: number }) {
  const bg = item.thumbnail
    ? { backgroundImage: `url("${item.thumbnail}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundImage: THUMBS[index % THUMBS.length] };
  // Just the ad itself: image/video thumbnail with a type badge, plus a Live
  // pill when this asset backs an ad running right now. No name caption.
  return (
    <Panel className="overflow-hidden p-0">
      <div className="relative flex aspect-square items-end bg-surface-2 p-2.5 text-white" style={bg}>
        {item.live && (
          <span
            className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
            style={{ backgroundColor: "#16a34a", boxShadow: "0 4px 10px rgba(22,163,74,.35)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Live
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm">
          {item.type === "video" ? <Play size={12} /> : <ImageIcon size={12} />}
          {item.type === "video" ? "Video" : "Photo"}
        </span>
      </div>
    </Panel>
  );
}

export default function AdsMedia() {
  const isDemo = demoMode();
  const { session } = useAuth();
  const { data } = useAdsMedia(!isDemo && Boolean(session));

  const configured = isDemo ? true : Boolean(data?.configured);
  const items = isDemo ? DEMO_ITEMS : data?.items ?? [];
  const liveCount = items.filter((it) => it.live).length;

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar
          tabs={PAID_ADS_TABS}
          description="Every photo and video in your ad account. The ones running right now are marked Live."
          actions={
            liveCount > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-positive-tint px-3 py-1.5 text-[12.5px] font-semibold text-positive">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                {liveCount} running now
              </span>
            ) : undefined
          }
        />

        {!configured && (
          <NotConnectedNotice message="Once your Meta ad account is connected, every photo and video we use in your ads shows up here." />
        )}

        {items.length > 0 ? (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item, i) => (
              <MediaTile key={item.id || i} item={item} index={i} />
            ))}
          </div>
        ) : (
          <Panel className="px-4 py-12">
            <EmptyState
              icon={<Film size={22} />}
              title="Nothing to show yet"
              description={
                configured
                  ? "Every photo and video in your ad account lands here."
                  : "Your ad photos and videos appear here after your account is connected."
              }
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}
