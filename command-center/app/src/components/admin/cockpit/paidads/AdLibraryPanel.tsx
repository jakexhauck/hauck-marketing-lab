import { useState, type FormEvent } from "react";
import { Image as ImageIcon, Video, Megaphone, Layers } from "lucide-react";
import { Panel, Badge, EmptyState, Button } from "../../../ui";
import {
  useAdminAdsMediaQuery,
  useAdminAdsCreativesQuery,
  useCreateAdCreative,
  type AdCreative,
  type CreateAdCreativeInput,
} from "../../../../hooks/useApi";
import { timeAgo } from "../../../../lib/timeAgo";

// Paid Ads > Ad Library. Two honest, separate things sharing one sub-tab:
//
//  1. This client's real Meta media library (their actual uploaded images and
//     videos), read from GET /api/admin/clients/:tenantId/ads/media, the same
//     shared adsMedia.buildAdsMedia core the client's own Media tab reads.
//  2. The agency's internal creatives tracker (migration 0027): draft/approved
//     /live rows an operator logs by hand, read/created via GET+POST
//     /api/admin/clients/:tenantId/ads/creatives.
//
// Pushing a tracked creative into the client's live ad account is out of
// scope here: it cannot be verified against a real Meta token in this build
// environment, so it is split to a Phase 2b follow-up. This panel says so.

const STATUS_META: Record<AdCreative["status"], { label: string; tone: "neutral" | "brand" | "positive" }> = {
  draft: { label: "Draft", tone: "neutral" },
  approved: { label: "Approved", tone: "brand" },
  live: { label: "Live", tone: "positive" },
};

const inputCls =
  "mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[13.5px] text-text placeholder:text-faint transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";
const labelCls = "label-cap block";

function MediaGallery({ tenantId }: { tenantId: string }) {
  const mediaQuery = useAdminAdsMediaQuery(tenantId);

  if (mediaQuery.isLoading) {
    return <div className="pk-empty">Loading this client's Meta media library...</div>;
  }
  if (mediaQuery.isError || !mediaQuery.data) {
    return <div className="pk-empty">Could not load this client's Meta media library.</div>;
  }

  const media = mediaQuery.data;

  if (!media.configured) {
    return (
      <Panel className="px-4 py-12">
        <EmptyState
          icon={<Megaphone size={22} />}
          title="Meta is not connected for this client yet"
          description="Add the client's ad account in Config to see their uploaded images and videos here."
        />
      </Panel>
    );
  }

  if (media.items.length === 0) {
    return (
      <Panel className="px-4 py-12">
        <EmptyState
          icon={<ImageIcon size={22} />}
          title="No media in this client's ad account yet"
          description="Images and videos uploaded to this client's Meta ad account will show up here."
        />
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {media.items.map((item) => (
        <Panel key={item.id} className="overflow-hidden p-0">
          <div className="relative aspect-square bg-[var(--surface-2)]">
            {item.thumbnail ? (
              <img
                src={item.thumbnail}
                alt={item.name || "Ad media"}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-faint">
                {item.type === "video" ? <Video size={24} /> : <ImageIcon size={24} />}
              </div>
            )}
            <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
              {item.type === "video" ? <Video size={11} /> : <ImageIcon size={11} />}
              {item.type === "video" ? "Video" : "Image"}
            </span>
          </div>
          <div className="truncate px-2.5 py-2 text-[12px] text-muted" title={item.name}>
            {item.name || "Untitled"}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function NewCreativeForm({ tenantId }: { tenantId: string }) {
  const createMutation = useCreateAdCreative(tenantId);
  const [mediaRef, setMediaRef] = useState("");
  const [headline, setHeadline] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [status, setStatus] = useState<CreateAdCreativeInput["status"]>("draft");
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await createMutation.mutateAsync({
        mediaRef: mediaRef.trim() || undefined,
        headline: headline.trim(),
        primaryText: primaryText.trim(),
        status,
      });
      setMediaRef("");
      setHeadline("");
      setPrimaryText("");
      setStatus("draft");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save this creative.");
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-[var(--radius)] border border-divider bg-surface-2/40 p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={labelCls}>Headline</span>
          <input
            className={inputCls}
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="50% off windows this month"
            maxLength={300}
            required
          />
        </label>
        <label className="sm:col-span-2">
          <span className={labelCls}>Primary text</span>
          <textarea
            className={`${inputCls} min-h-[72px] resize-y`}
            value={primaryText}
            onChange={(e) => setPrimaryText(e.target.value)}
            placeholder="Book this month and save on your new windows."
            maxLength={2000}
            required
          />
        </label>
        <label>
          <span className={labelCls}>Media reference (optional)</span>
          <input
            className={inputCls}
            value={mediaRef}
            onChange={(e) => setMediaRef(e.target.value)}
            placeholder="Image hash or video id from the gallery above"
          />
        </label>
        <label>
          <span className={labelCls}>Status</span>
          <select
            className={inputCls}
            value={status}
            onChange={(e) => setStatus(e.target.value as CreateAdCreativeInput["status"])}
          >
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="live">Live</option>
          </select>
        </label>
      </div>

      {err && <p className="mt-3 text-[13px] text-danger">{err}</p>}

      <div className="mt-3 flex justify-end">
        <Button type="submit" variant="primary" size="sm" loading={createMutation.isPending}>
          Save creative
        </Button>
      </div>
    </form>
  );
}

function CreativeRow({ creative }: { creative: AdCreative }) {
  const meta = STATUS_META[creative.status];
  return (
    <Panel className="p-3.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="truncate font-display text-[13.5px] text-text">
          {creative.headline || "Untitled creative"}
        </span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
      <p className="text-[12.5px] leading-snug text-muted">{creative.primaryText}</p>
      <div className="mt-2 text-[11px] text-faint">
        {timeAgo(creative.createdAt)}
        {creative.mediaRef ? ` · media: ${creative.mediaRef}` : ""}
      </div>
    </Panel>
  );
}

function CreativesTracker({ tenantId }: { tenantId: string }) {
  const creativesQuery = useAdminAdsCreativesQuery(tenantId);

  return (
    <div>
      <NewCreativeForm tenantId={tenantId} />

      <p className="mb-3 mt-4 text-[12px] text-faint">
        Pushing creatives to the client's Meta account is coming in a follow-up. This tracker
        is agency-side only for now.
      </p>

      {creativesQuery.isLoading ? (
        <div className="pk-empty">Loading draft creatives...</div>
      ) : creativesQuery.isError || !creativesQuery.data ? (
        <div className="pk-empty">Could not load this client's draft creatives.</div>
      ) : creativesQuery.data.unavailable ? (
        <div className="pk-empty">Could not load this client's draft creatives.</div>
      ) : creativesQuery.data.creatives.length === 0 ? (
        <Panel className="px-4 py-12">
          <EmptyState
            icon={<Layers size={22} />}
            title="No draft creatives yet"
            description="Log a headline and primary text above to start tracking creatives for this client."
          />
        </Panel>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {creativesQuery.data.creatives.map((c) => (
            <li key={c.id}>
              <CreativeRow creative={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdLibraryPanel({ tenantId }: { tenantId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="label-cap mb-0.5">Real ad account media</div>
        <h3 className="mb-3 font-display text-[15px] text-text">
          This client's Meta media library
        </h3>
        <MediaGallery tenantId={tenantId} />
      </div>

      <div>
        <div className="label-cap mb-0.5">Internal tracker</div>
        <h3 className="mb-3 font-display text-[15px] text-text">Draft creatives</h3>
        <CreativesTracker tenantId={tenantId} />
      </div>
    </div>
  );
}
