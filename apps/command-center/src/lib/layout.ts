// The one container every client page uses for its content. Full-bleed: it fills
// the width beside the sidebar with a consistent gutter, with no centered
// max-width cap (that cap was the "white space" on the left and right). Phone
// (capped by Shell's max-w-md) keeps the 20px gutter; desktop uses 24px.
//
// Every page's scroll column should use this, paired with <PageHeader> at the
// top. See docs/PAGE_LAYOUT.md for the full page skeleton.
export const PAGE_CONTAINER =
  "flex min-h-0 w-full flex-1 flex-col px-5 pb-12 pt-5 lg:px-6";
