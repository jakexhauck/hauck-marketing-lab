import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { AdCreativeFile } from "../../lib/api";

// One creative, full screen, over the page. Images show, videos play with the
// browser's own controls. Arrow keys step through the grid, Esc closes.
//
// Portalled to <body> for the same reason as CallModal: an ancestor with
// overflow-x turns a fixed child into a clipped one.
export default function CreativeViewer({
  files,
  index,
  onIndex,
  onClose,
}: {
  files: AdCreativeFile[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const file = files[index];
  const many = files.length > 1;
  const prev = () => onIndex((index - 1 + files.length) % files.length);
  const next = () => onIndex((index + 1) % files.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && many) prev();
      else if (e.key === "ArrowRight" && many) next();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
    // prev/next close over index, so the listener is rebuilt when it moves.
  }, [index, files.length]);

  if (!file) return null;

  const navButton =
    "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/75";

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      onClick={onClose}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{file.name}</span>
        {many && (
          <span className="tnum text-[12px] text-white/60">
            {index + 1} / {files.length}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16">
        <div className="flex h-full w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {!file.url ? (
            <p className="text-[13px] text-white/70">This file could not be loaded.</p>
          ) : file.kind === "video" ? (
            <video
              key={file.id}
              src={file.url}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full rounded-md"
            />
          ) : (
            <img key={file.id} src={file.url} alt={file.name} className="max-h-full max-w-full rounded-md object-contain" />
          )}
        </div>

        {many && (
          <>
            <button
              type="button"
              aria-label="Previous"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              className={`${navButton} left-2 sm:left-4`}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              className={`${navButton} right-2 sm:right-4`}
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
