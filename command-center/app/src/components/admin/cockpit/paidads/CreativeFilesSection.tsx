import { useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import CreativesGrid from "../../../ads/CreativesGrid";
import { ErrorNote, Spinner } from "../../../../routes/paid-ads/trackerShared";
import {
  uploadAdCreativeFile,
  useAdminCreativeFilesQuery,
  useDeleteAdCreativeFile,
  useSetAdminCreativeFiles,
} from "../../../../hooks/useApi";
import { probeFile } from "../../../../lib/creativeProbe";
import { shrinkCreative, UPLOAD_CAP_BYTES } from "../../../../lib/shrinkCreative";

// The client's creatives, as uploaded here and shown on their own Creatives
// page. Dropping a file uploads it straight away; nothing goes to Meta. A file
// over the 50 MB cap is shrunk in the browser first (see shrinkCreative.ts). A
// .mov is always converted to MP4: iPhone .mov is often HEVC, which Chrome
// cannot play, and the whole point is that the client can watch it.

type Job = {
  id: string;
  name: string;
  phase: "shrinking" | "uploading";
  progress: number;
  error: string | null;
};

let nextId = 0;

export default function CreativeFilesSection({ tenantId }: { tenantId: string }) {
  const query = useAdminCreativeFilesQuery(tenantId);
  const setFiles = useSetAdminCreativeFiles(tenantId);
  const remove = useDeleteAdCreativeFile(tenantId);
  const input = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [over, setOver] = useState(false);

  const patch = (id: string, change: Partial<Job>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...change } : j)));

  async function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list).map((file) => ({ id: `u${nextId++}`, file }));
    setJobs((prev) => [...prev, ...incoming.map(({ id, file }) => ({ id, name: file.name, phase: "uploading" as const, progress: 0, error: null }))]);

    // One at a time: a pile of videos in parallel starves each other and the
    // progress bars all crawl together.
    for (const { id, file: dropped } of incoming) {
      const type = dropped.type || "";
      if (!type.startsWith("image/") && !type.startsWith("video/")) {
        patch(id, { error: "Not an image or video." });
        continue;
      }
      try {
        let file = dropped;
        if (file.size > UPLOAD_CAP_BYTES || type === "video/quicktime") {
          patch(id, { phase: "shrinking", progress: 0 });
          file = await shrinkCreative(file, (p) => patch(id, { progress: p }));
          patch(id, { phase: "uploading", progress: 0 });
        }
        const { width, height } = await probeFile(id, file);
        const data = await uploadAdCreativeFile(tenantId, file, { width, height }, (p) => patch(id, { progress: p }));
        setFiles(data);
        setJobs((prev) => prev.filter((j) => j.id !== id));
      } catch (err) {
        patch(id, { error: (err as Error).message || "Upload failed." });
      }
    }
  }

  const files = query.data?.files ?? [];
  const deleteError = remove.isError ? ((remove.error as Error | null)?.message ?? "Could not delete.") : null;

  return (
    <section className="shrink-0 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-[15px] font-semibold text-text">Creatives</h2>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void add(e.dataTransfer.files);
        }}
        className={`mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-[13px] font-medium transition-colors ${
          over ? "border-brand bg-brand/5 text-brand" : "border-border text-muted hover:border-brand hover:text-brand"
        }`}
      >
        <UploadCloud size={22} aria-hidden />
        Drop images and videos
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />

      {jobs.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px] text-text">{j.name}</span>
              {j.error ? (
                <>
                  <span className="text-[12px] font-medium text-danger">{j.error}</span>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => setJobs((prev) => prev.filter((x) => x.id !== j.id))}
                    className="text-muted transition-colors hover:text-text"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-[12px] text-muted">{j.phase === "shrinking" ? "Shrinking" : "Uploading"}</span>
                  <span className="flex w-32 items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-brand transition-[width]"
                      style={{ width: `${Math.round(j.progress * 100)}%` }}
                    />
                  </span>
                  <span className="tnum w-9 text-right text-[12px] text-muted">{Math.round(j.progress * 100)}%</span>
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        {query.isError ? (
          <ErrorNote message={(query.error as Error | null)?.message} />
        ) : query.isLoading && !query.data ? (
          <Spinner />
        ) : (
          <>
            {deleteError && <p className="mb-3 text-[12.5px] text-danger">{deleteError}</p>}
            <CreativesGrid
              files={files}
              onDelete={(id) => remove.mutate(id)}
              deletingId={remove.isPending ? (remove.variables ?? null) : null}
            />
          </>
        )}
      </div>
    </section>
  );
}
