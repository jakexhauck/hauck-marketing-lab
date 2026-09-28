import { useState } from "react";
import { Film, ImageIcon } from "lucide-react";
import { RATIOS, type CreativeKind, type Ratio } from "../../../../../functions/lib/creativeNames";
import type { LibraryItem } from "../../../../../functions/lib/metaUpload";

// The labelled creatives in the client's Meta ad account, filed the way Jake
// keeps them: Images and Videos, one card per creative holding its 1:1 and 4:5.
// Meta has no folders in an ad account library, so this is the folder view,
// built from the names.

interface Creative {
  base: string;
  created: string;
  sizes: Partial<Record<Ratio, LibraryItem>>;
}

function group(items: LibraryItem[], kind: CreativeKind): Creative[] {
  const map = new Map<string, Creative>();
  for (const it of items) {
    if (it.kind !== kind) continue;
    const key = it.base.toLowerCase();
    const c = map.get(key) ?? { base: it.base, created: it.created, sizes: {} };
    // Newest wins if the same label was uploaded twice by hand.
    if (!c.sizes[it.ratio]) c.sizes[it.ratio] = it;
    if (it.created > c.created) c.created = it.created;
    map.set(key, c);
  }
  return [...map.values()].sort((a, b) => b.created.localeCompare(a.created));
}

export default function CreativeLibrary({ items }: { items: LibraryItem[] }) {
  const [kind, setKind] = useState<CreativeKind>("image");
  const creatives = group(items, kind);
  const count = (k: CreativeKind) => group(items, k).length;

  return (
    <section className="shrink-0 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold text-text">Meta library</h2>
        <div className="ml-auto flex rounded-[var(--radius)] border border-border bg-surface-2 p-0.5">
          {(["image", "video"] as CreativeKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-[calc(var(--radius)-2px)] px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                kind === k ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
              }`}
            >
              {k === "image" ? "Images" : "Videos"} <span className="tnum text-faint">{count(k)}</span>
            </button>
          ))}
        </div>
      </div>

      {creatives.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">{kind === "image" ? "No images yet." : "No videos yet."}</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {creatives.map((c) => (
            <div key={c.base} className="rounded-lg border border-border bg-surface-2 p-2.5">
              <div className="grid grid-cols-2 items-end gap-2">
                {RATIOS.map((r) => (
                  <Thumb key={r} ratio={r} item={c.sizes[r]} kind={kind} />
                ))}
              </div>
              <span className="mt-2 block truncate text-[13px] font-medium text-text" title={c.base}>
                {c.base}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Thumb({ ratio, item, kind }: { ratio: Ratio; item?: LibraryItem; kind: CreativeKind }) {
  const [broken, setBroken] = useState(false);
  const Icon = kind === "video" ? Film : ImageIcon;
  const shape = ratio === "1:1" ? "aspect-square" : "aspect-[4/5]";

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`${shape} relative flex items-center justify-center overflow-hidden rounded-md ${
          item ? "bg-surface" : "border border-dashed border-warning/50"
        }`}
      >
        {item && item.thumbnail && !broken ? (
          <img
            src={item.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <Icon size={20} className={item ? "text-faint" : "text-warning/70"} aria-hidden />
        )}
        {item?.processing && (
          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Processing
          </span>
        )}
      </div>
      <span className={`text-[11.5px] font-semibold tnum ${item ? "text-muted" : "text-warning"}`}>
        {item ? ratio : `No ${ratio}`}
      </span>
    </div>
  );
}
