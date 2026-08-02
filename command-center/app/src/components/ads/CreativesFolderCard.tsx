import type { ReactNode } from "react";
import { ExternalLink, FolderOpen } from "lucide-react";

// The ad-creatives folder card: a Drive folder said plainly, with one button
// that opens it.
//
// Rendered by BOTH the client's own Creatives page and the admin cockpit's Paid
// Ads > Creatives tab. It links out and nothing else. It does not read the
// folder's contents, which is why it works without the agency Drive OAuth
// connection that the assets/SOP system still waits on.
//
// This replaced Ad Library, which tried to mirror the Meta media library AND
// hold a hand-typed creatives tracker. Creatives are made and kept in Drive, so
// the app stops keeping a second copy and points at the first one.

export default function CreativesFolderCard({
  url,
  title,
  description,
  emptyText,
  children,
}: {
  // Null means no folder has been mapped for this client yet.
  url: string | null;
  title: string;
  description: string;
  // What to say when there is no folder. Different for an operator (who can fix
  // it here) than for a client (who cannot), so the caller supplies it rather
  // than this component guessing.
  emptyText: string;
  // The operator's paste field. Absent on the client's page.
  children?: ReactNode;
}) {
  return (
    <div className="shrink-0 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"
          aria-hidden
        >
          <FolderOpen size={21} />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-text">{title}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            {url ? description : emptyText}
          </p>
        </div>

        {url && (
          // rel is not optional here: target=_blank without noreferrer hands the
          // opened tab a window.opener it can navigate this app with.
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-colors hover:border-brand hover:text-brand"
          >
            Open in Drive
            <ExternalLink size={15} aria-hidden />
          </a>
        )}
      </div>

      {children && <div className="mt-5 border-t border-border pt-5">{children}</div>}
    </div>
  );
}
