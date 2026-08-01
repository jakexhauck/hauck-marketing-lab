import type { ReactNode } from "react";
import PageBar from "../PageBar";
import { TAB_TRACK, TabButton } from "../PageTabs";

// The header every admin console page opens with.
//
// One structure, borrowed wholesale from the client app's Sales page: a floating
// surface panel carrying the section name on the left, the segmented sliding page
// switcher beside it, and the page's own actions pinned right. Before this, admin
// pages opened with a 26px display title over a bottom-ruled row of tab links
// (.pk-titlerow + .pk-tabs), which is why the two halves of the product read as
// two different applications.
//
// The switcher is built from TAB_TRACK and TabButton, the same primitives the
// client route tabs use, so an in-place strip here cannot drift from the ones
// over there. Restyle those and every surface in both halves follows.
//
// Tabs here switch STATE, not routes: an admin page keeps its active view in
// ?tab= / ?view= and re-renders in place, so these are buttons rather than
// NavLinks and the sliding indicator is the pill on the active button.
//
// No description slot, matching the client app. Explanatory paragraphs under a
// header are banned across the product; the section name and the tab labels say
// what the page is.

export interface AdminPageTab {
  id: string;
  label: string;
}

export default function AdminPage({
  section,
  tabs = [],
  active,
  onSelect,
  actions,
  children,
  // A nested strip renders WITHOUT the panel: it is a second level inside a page
  // that already has a header, so it gets the segmented track alone. Cold Call's
  // stage pages and Management's sub-pages use this.
  bare = false,
}: {
  section: string;
  tabs?: AdminPageTab[];
  active?: string;
  onSelect?: (id: string) => void;
  actions?: ReactNode;
  children?: ReactNode;
  bare?: boolean;
}) {
  // A section with one page or none renders no control at all, rather than a
  // lone pill that looks clickable and does nothing.
  const track =
    tabs.length > 1 && onSelect ? (
      <div className={TAB_TRACK}>
        {tabs.map((t) => (
          <TabButton key={t.id} active={t.id === active} onClick={() => onSelect(t.id)}>
            {t.label}
          </TabButton>
        ))}
      </div>
    ) : null;

  if (bare) {
    return (
      <>
        {track && (
          // shrink-0 on the scroll container: inside a flex column, overflow-x-auto
          // plus flex-shrink turns into a CLIP rather than a scroll, and the strip
          // gets squashed to nothing on a tall page.
          <nav
            aria-label={`${section} pages`}
            className="mb-5 flex shrink-0 overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {track}
          </nav>
        )}
        {children}
      </>
    );
  }

  return (
    <>
      {/* globalControls off: that cluster is the client app's notification bell,
          and the admin console has its own rail. */}
      <PageBar tabs={[]} section={section} actions={actions} globalControls={false}>
        {track}
      </PageBar>
      {children}
    </>
  );
}
