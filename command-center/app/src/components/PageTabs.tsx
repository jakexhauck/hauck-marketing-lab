import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { PageTab } from "../lib/pageTabs";

// The animated tab links, shared by the standalone <PageTabs> bar (Leads) and
// the combined <PageBar> header (every Marketing section). This one component
// is the tab treatment for the WHOLE client app: 36 pages reach it through
// PageBar, 3 more through PageTabs. Restyle here, restyle everywhere.
//
// Two independent indicators slide behind the row:
//   - a soft neutral pill that follows the cursor (hover only, desktop)
//   - the brand underline, which slides to whichever tab is active
//
// Deliberately no animation library. The reference component this was modelled
// on uses motion's layoutId; the same result is one measured translateX + width
// per indicator, and a PWA does not need a ~50kb dependency to move two
// rectangles. Both indicators animate transform and width only, so they stay on
// the compositor.
//
// Positions are MEASURED rather than computed, because tab labels are variable
// width and the font loads late. Everything re-measures on route change and on
// any resize of the row.

// Both axes, because the track WRAPS on a phone (see TabLinks): a tab on the
// second row shares its left/width with one on the first, so an indicator that
// only knew x would park itself on the wrong line.
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// The shared tab language, exported so in-place tab strips (the Inbox filters,
// Reviews Chats, the Sales switcher) cannot drift from the route tabs below.
// Three hand-copies of this had already fallen out of sync once.
//
// TAB_TRACK is the recessed groove; TabButton is one pill inside it. Route tabs
// get a sliding indicator (TabLinks); in-place strips place the pill directly,
// because several are split by a divider and a track sliding across a seam
// reads as broken rather than smooth.
export const TAB_TRACK =
  "inline-flex items-stretch gap-0.5 rounded-[10px] bg-[var(--surface-2)] p-[3px]";

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        "shrink-0 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[12.5px] transition-colors",
        active
          ? "bg-[var(--surface)] font-semibold text-[var(--text)] shadow-[var(--shadow-sm)]"
          : "font-medium text-[var(--text-muted)] hover:text-[var(--text)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// Where the active tab is. Read off the DOM via aria-current, which react-router
// sets on the active NavLink, rather than re-implementing its matching rules
// (the `end` prop, nested routes, search params). One source of truth for "which
// tab is on", and it is the router's.
function measureActive(wrap: HTMLElement | null): Rect | null {
  if (!wrap) return null;
  const el = wrap.querySelector<HTMLElement>('[aria-current="page"]');
  if (!el) return null;
  return {
    left: el.offsetLeft,
    top: el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

export function TabLinks({ tabs }: { tabs: PageTab[] }) {
  const location = useLocation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Rect | null>(null);
  const [hover, setHover] = useState<Rect | null>(null);
  // First paint places the underline without sliding: animating it in from the
  // left edge on every page load would read as a glitch, not a flourish.
  const [ready, setReady] = useState(false);

  const syncActive = useCallback(() => {
    setActive(measureActive(wrapRef.current));
  }, []);

  // Route changed, or the tab list did. useLayoutEffect so the move is painted
  // in the same frame as the new active state.
  useLayoutEffect(() => {
    syncActive();
  }, [syncActive, location.pathname, location.search, tabs]);

  // Mark ready one frame after the first measure, so the initial position is a
  // jump and every position after it is a slide.
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // The row can change width without the route changing: window resize, sidebar
  // collapse, or the webfont swapping in and re-flowing every label.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(syncActive);
    ro.observe(wrap);
    for (const child of Array.from(wrap.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [syncActive, tabs]);

  // A section with no sub-pages (the Inbox) renders no control at all. Without
  // this the empty segmented track still paints its own background and padding,
  // leaving a small grey nub floating beside the title.
  if (tabs.length === 0) return null;

  // Positioned on both axes now (translate x/y + explicit height) rather than
  // stretched between top-[3px] and bottom-[3px], so it can land on any row.
  const indicator =
    "pointer-events-none absolute left-0 top-0 rounded-[7px] transition-[transform,width,height,opacity] duration-[260ms] motion-reduce:transition-none";

  return (
    <div
      ref={wrapRef}
      // The segmented track: a recessed surface-2 groove the tabs sit in, so
      // the group reads as ONE control rather than scattered links.
      //
      // WRAPS below lg. A phone cannot fit five tabs on one line, and the old
      // single-line track hid the overflow inside a scroller with no visible
      // affordance: Outreach and Social showed one tab and a client had no way
      // to know Schedule/Emails/Data/SMS existed. Wrapping shows every page at
      // once, which is the whole point of the control. Desktop is unchanged
      // (nowrap, one line, identical metrics).
      className="relative flex flex-wrap items-stretch justify-center gap-0.5 rounded-[10px] bg-[var(--surface-2)] p-[3px] lg:shrink-0 lg:flex-nowrap lg:justify-start"
      onMouseLeave={() => setHover(null)}
    >
      {/* Hover tint, behind the raised pill. Fades out entirely when the cursor
          leaves the row rather than parking on the last tab hovered. */}
      <span
        aria-hidden="true"
        className={`${indicator} bg-[color-mix(in_srgb,var(--text)_6%,transparent)]`}
        style={{
          transform: `translate(${hover?.left ?? 0}px, ${hover?.top ?? 0}px)`,
          width: hover?.width ?? 0,
          height: hover?.height ?? 0,
          opacity: hover ? 1 : 0,
          transitionTimingFunction: "var(--ease-out)",
        }}
      />

      {/* The active tab: a raised surface pill that SLIDES between tabs. This
          is the piece the reference component animates with motion's layoutId;
          here it is a measured transform, same result without the dependency. */}
      <span
        aria-hidden="true"
        className={`${indicator} bg-[var(--surface)] shadow-[var(--shadow-sm)]`}
        style={{
          transform: `translate(${active?.left ?? 0}px, ${active?.top ?? 0}px)`,
          width: active?.width ?? 0,
          height: active?.height ?? 0,
          opacity: active ? 1 : 0,
          transitionTimingFunction: "var(--ease-out)",
          transitionDuration: ready ? undefined : "0ms",
        }}
      />

      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          onMouseEnter={(e) =>
            setHover({
              left: e.currentTarget.offsetLeft,
              top: e.currentTarget.offsetTop,
              width: e.currentTarget.offsetWidth,
              height: e.currentTarget.offsetHeight,
            })
          }
          className={({ isActive }) =>
            [
              "relative z-10 shrink-0 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[12.5px] transition-colors",
              isActive
                ? "font-semibold text-[var(--text)]"
                : "font-medium text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

// Standalone in-page sub-navigation (used by the Leads section, which has its
// own bespoke header). Marketing sections use <PageBar>, which folds this row in
// beside the section title. No divider any more: the segmented track is its own
// container, so a rule under it would just be a second, competing edge.
export default function PageTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    <nav
      aria-label="Section pages"
      // shrink-0: PAGE_CONTAINER is a flex column with flex-1, so on tall pages
      // flex-shrink would otherwise squeeze this (it has overflow-x-auto) down
      // to nothing. Keep its natural height on every page.
      className="mb-5 flex shrink-0 justify-center overflow-x-auto lg:justify-start"
      style={{ scrollbarWidth: "none" }}
    >
      <TabLinks tabs={tabs} />
    </nav>
  );
}
