# Page layout — the one client page shell

Every client-app page (desktop) shares one structure so the app feels like a
single product, not a pile of screens:

```
┌──────────┬───────────────────────────────────┐
│ Sidebar  │  PageHeader  (title + description, │
│          │               actions on the right)│
│  nav…    │                                    │
│          │  …full-width content (24px gutter) │
│ search   │   cards / tables / charts          │
│ 🔔 💬 👤 │                                    │
└──────────┴───────────────────────────────────┘
```

- **Header:** the `PageHeader` component (`src/components/PageHeader.tsx`) — Poppins
  22px title, a muted description line, and right-aligned `actions`. This is the
  "Paid Ads" header. Do **not** add a per-page top bar.
- **Content width:** full-bleed with a 24px desktop gutter. Use `PAGE_CONTAINER`
  from `src/lib/layout.ts`. No `max-w-…` cap and no `mx-auto` on the page column
  (those are the left/right "white space" we removed).
- **Global controls** (search, notifications bell, agency chat, account menu) live
  in the **sidebar footer** (`src/components/Sidebar.tsx`), once, for every page.
  Never re-add them to a page.

## New responsive page (Marketing/Sales pattern — preferred)

One file that works on phone (capped by `Shell`'s `max-w-md`) and desktop (full
width):

```tsx
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { PAGE_CONTAINER } from "../../lib/layout";

export default function MyPage() {
  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageHeader
          title="My Page"
          description="One plain line on what this page is for."
          actions={/* optional buttons / Segmented */}
        />
        {/* content */}
      </div>
    </Shell>
  );
}
```

A section's `shared.tsx` should just re-export it: `export const MY_CONTAINER = PAGE_CONTAINER;`

## Page that has a separate desktop layout (app-shell pattern)

Some pages render a phone layout plus a dedicated `*Desktop` component. The desktop
half wraps in `DesktopPage` (`src/components/desktop/DesktopPage.tsx`), which already
renders the `PageHeader` and the full-width 24px column for you:

```tsx
import DesktopPage from "../desktop/DesktopPage";

export default function MyPageDesktop() {
  return (
    <DesktopPage title="My Page" subtitle="One plain line." actions={/* optional */}>
      {/* content */}
    </DesktopPage>
  );
}
```

Use `flush` only for full-bleed surfaces (e.g. a three-pane inbox) that manage their
own scroll regions below the header.

## Don'ts

- No `mx-auto max-w-6xl` (or any `max-w` cap) on a page column — that brings back the
  white space.
- No second header style and no per-page search / bell / avatar.
- Desktop is standardized; phone layouts are a separate later pass — don't change phone
  gutters here.
