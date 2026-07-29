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
    id: "2026-07-29-sops-live-from-drive",
    date: "29 July 2026",
    title: "The SOPs tab keeps itself in step with Drive",
    items: [
      "Operations > SOPs has a Connect Google Drive button. Until now the only way to link the account was to type an address into the browser by hand, so the tab sat empty.",
      "The notice names the Google account that owns the SOPs folder, and says which account is currently linked, so signing in as the wrong one is obvious instead of showing up as an unexplained refusal.",
      "Leave the tab open and it keeps up on its own. Add a Doc to the folder in Drive and it appears within a minute, without a reload.",
      "Editing an SOP in Drive while you have it open in the app now updates what you are reading. It used to keep showing the version from when you first opened it.",
      "An SOP you have open that gets moved or deleted in Drive says so, instead of sitting there as a page that no longer exists.",
    ],
  },
  {
    id: "2026-07-29-agency-cold-call-tracker",
    date: "29 July 2026",
    title: "The cold call tracker now has an agency view",
    items: [
      'The person picker above the cold calling pages says "Agency" instead of "Everyone".',
      "With it on Agency, Tracker no longer asks you to pick somebody. It draws the same tracker you get for one caller, with every caller's day added together: the same tiles, the same columns, the same Average and Total MTD.",
      "The totals match the sum of the individual trackers, including any dialing somebody typed in by hand for calls made off-app. The subtitle says how many people are in the month and how many of its days contain typed counts.",
      "Nothing on the agency view can be typed into, since a cell there is a total of several people rather than anybody's own row. Pick a name to type.",
      'The "Why they said no" counts are merged across the roster too, so one row tells you what the whole team is hearing that day.',
    ],
  },
  {
    id: "2026-07-28-objections-panel",
    date: "28 July 2026",
    title: "Objection handling is one click away, and the dial stages say what they mean",
    items: [
      "New Objections button next to Dialing script. It opens the objection handling document as its own floating panel on the right, so it and the script can be open at once: the script in one hand, the answer to what was just said in the other.",
      "Like the script panel, it can be dragged anywhere and resized, and the page underneath keeps working while it is open.",
      'The two dial stages now read "No Answer Day 1" and "No Answer Day 2" instead of "1st Dial" and "2nd Dial", which is what the GoHighLevel automations have always called them.',
    ],
  },
  {
    id: "2026-07-28-callback-time-and-scripts",
    date: "28 July 2026",
    title: "Callbacks now have a time, and each call names its script",
    items: [
      'The third outcome button is now "Call back" rather than "Hot lead". It always moved the prospect into Call Back in GoHighLevel; now it says so.',
      "Picking when to ring them back is a proper calendar with the times beside it, the same one booking uses, instead of a typed date box.",
      'You can give a callback a time. The task that lands in GoHighLevel is due at that time rather than always 9am. A time is optional: "Thursday, some time" stays exactly that.',
      'The Callbacks queue shows the time next to the day, so "Today" and "Today 2:30 pm" are no longer the same chip.',
      "On the call card you can now choose which script the call is being recorded against, per prospect. Switching variation call by call is how a script test actually gets run.",
    ],
  },
  {
    id: "2026-07-28-task-categories",
    date: "28 July 2026",
    title: "Tasks can be sorted into your own categories",
    items: [
      "Every task now has a Category, picked from a list you build yourself. There is nothing preset: add the categories that match how you actually work.",
      "Add, rename, recolour and remove them from Manage above the list, or from the bottom of any task's category dropdown.",
      "The row of buttons above the checklist filters it to one category at a time, with a live count on each. Uncategorised shows up as its own filter whenever something has no category yet.",
      "Removing a category never removes the work. Anything filed under it stays in the list as uncategorised.",
      "Drag-to-reorder stays available on the full list. While a filter is on, the drag handles hide, since reordering part of a list would shuffle the rest.",
    ],
  },
  {
    id: "2026-07-28-ghl-lead-sync",
    date: "28 July 2026",
    title: "Prospects added in GoHighLevel now show up here",
    items: [
      "Anyone added to the cold calling board in GoHighLevel now appears in the console automatically. Until now the console only knew about prospects typed or imported here, so anything created over there sat in no queue and no count.",
      "It happens on its own when you open Cold Call. If anything new came across, a line at the top says how many.",
      "Nobody gets added twice. A prospect already in the book is recognised by their number even if it is written differently, or by their GoHighLevel record.",
      "New arrivals land unassigned and in the stage GoHighLevel has them in, so they drop straight into the right page.",
    ],
  },
  {
    id: "2026-07-27-health-watchdog",
    date: "27 July 2026",
    title: "The console now checks itself every half hour",
    items: [
      "Connections are checked automatically every 30 minutes, so something breaking overnight is known by morning instead of whenever someone next opens Settings.",
      "If something that was working stops working, admin devices get one notification saying what went down and which page goes dark with it. Nothing that stays broken nags you again.",
      "A new Scheduled health checks row shows when the last automatic check ran, and goes red if the checker itself stops.",
    ],
  },
  {
    id: "2026-07-27-cold-call-sops",
    date: "27 July 2026",
    title: "Cold calling: SOPs you can read on the job",
    items: [
      "New SOPs page in cold calling: how the job is done, written by Jake and readable by everyone. Pick a document from the dropdown and it opens full width, laid out to be read start to finish.",
      "SOPs live on their own page rather than in the mid-call panel, because they are for reading before the first dial and between calls, not while somebody is on the line.",
    ],
  },
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
