// What changed in the console, and who has already been told.
//
// The agency console has more than one person in it now, so a feature that
// ships silently is a feature only the person who asked for it knows about.
// Every release that changes what someone can DO gets an entry here, and the
// admin shell shows it once per person.
//
// Pure and testable: no React, no storage, no Date.now(). The component owns
// reading and writing; this file owns what a release is and which ones a given
// person still owes a look at.

export interface Release {
  // Stable, sortable, and never reused: this is the value stored against a
  // person to say "seen up to here". Renaming one re-shows the release, which
  // is the safe direction to be wrong in.
  id: string;
  // "27 July 2026", written out rather than derived, so the note reads the same
  // in every timezone.
  date: string;
  title: string;
  // One line per thing a person can now do. Written for the person using it,
  // not for the person who built it: no file names, no table names.
  items: string[];
}

// Newest FIRST. The list is the source of truth for the popup and its order.
export const RELEASES: Release[] = [
  {
    id: "2026-07-27-settings-control-room",
    date: "27 July 2026",
    title: "Settings tells you what is broken, and what breaks with it",
    items: [
      "Agency Settings now opens on a short list of what needs you, worst first, instead of a wall of settings. Everything working stays quiet.",
      "Every connection says what it feeds. When something goes down you are told the page that goes dark with it, not the name of a key.",
      "A By surface view answers the other direction: pick a page that looks empty and see everything it needs to work.",
      "Per client: see and fix a client's own credentials in the app, without going near a terminal.",
      "Read this page on the live site, not localhost. Localhost cannot see the real credentials and says so at the top.",
    ],
  },
  {
    id: "2026-07-27-cold-call-availability",
    date: "27 July 2026",
    title: "Cold calling: your hours, and one place to run it from",
    items: [
      "New Availability page: paint the hours you are on the phones for the week. Drag across the grid to mark a block, drag back across it to clear.",
      "Everything on the owner's side now lives under one Management tab: assigning leads, the team's availability, the scripts, the call shelf and the stage check.",
      "The Settings tab is gone. Its three panels moved into Management under their own names, and old links still open the right page.",
    ],
  },
];

// The newest release, or null when there are none.
export function latestRelease(): Release | null {
  return RELEASES[0] ?? null;
}

// What to show someone who last saw `seenId`.
//
// A person with nothing stored is NOT shown the whole history: they get the
// latest release only. Someone signing in for the first time wants to know what
// the console does now, not to read a changelog back to the beginning.
//
// An unrecognised `seenId` (a release renamed or removed since they saw it) is
// treated the same as nothing stored, so a stale value can never hide every
// release forever.
export function unseenReleases(seenId: string | null | undefined): Release[] {
  if (!seenId) return RELEASES.slice(0, 1);
  const index = RELEASES.findIndex((r) => r.id === seenId);
  if (index === -1) return RELEASES.slice(0, 1);
  // Everything newer than the one they saw. Index 0 means fully caught up.
  return RELEASES.slice(0, index);
}

// The per-person storage key. Keyed by admin id so two people sharing a browser
// do not mark each other's updates as read, and so signing in as someone else
// does not hide their notes.
//
// A missing id gets its own key rather than a shared one: an unidentified
// session marking "seen" must not silently answer for a real account.
export function seenStorageKey(adminId: string | null | undefined): string {
  return `hml.admin.release.seen.${adminId || "anonymous"}`;
}
