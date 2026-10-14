# UI Polish Backlog (client mobile app)

Strictly UI and ease-of-use. No new features, no backend, no data-model changes.
Goal: make the app dead simple for a non-technical client and make it look premium.

Audited 2026-06-28 across every client-facing screen and its empty/loading/error
states. Effort: S = under ~30 min, M = ~1 to 2 hrs. Items are grouped so related
one-line tweaks ship together.

Already shipped (do not repeat): unread badge on Chats, tappable contacts +
detail page, "Updated Xm ago" on Home, exact lead money, persisted Leads
view/pipeline, sign-out confirmation, live phone formatting, channel tags +
absolute chat dates, skeleton loaders on the four main screens.

---

## Tier 1 — highest return, mostly quick wins

1. **Consistent press feedback on every tappable thing.** (S)
   Many rows/buttons only shift background on press, which is imperceptible. Add a
   uniform `active:scale-[0.97-0.99]` (plus the existing bg shift) to: Home featured
   card and pipeline rows, stage filter pills (StagePill), board Move buttons,
   conversation rows, Notifications/Calendar/Billing list rows, and outline buttons.
   Why: a tap that visibly responds feels reliable; the app stops feeling laggy.

2. **Bump all touch targets to 44px minimum.** (S)
   Below the iOS standard today: contact call/email buttons (36px), search clear "X"
   (32px), Settings section icon buttons (38px). Raise to 44px hit areas.
   Why: fewer mis-taps for a client using one thumb on the go.

3. **Lift tiny text to legible sizes + fix heading consistency.** (S)
   Bottom-nav labels (10.5px), conversation list timestamps (10.5px), thread
   timestamps (10px), and contact secondary text are too small. Nudge up one step.
   Settings and Leads headers are smaller than Notifications/Calendar/Billing; match them.
   Why: a client should never squint or feel screens are inconsistent.

4. **Skeletons + "Loading" labels on the remaining screens.** (M)
   Contacts, Notifications, Calendar, and Billing still show a bare spinner. Give them
   the same skeleton treatment the four main screens now have, and label any remaining
   spinner "Loading" so it never reads as frozen.
   Why: consistency and a sense the app is fast, not stuck.

5. **Actionable empty states everywhere.** (S)
   "No notifications" / "No appointments" / "No invoices" / "No stages" say nothing
   about what fills them. Add one line each (e.g. "Appointments booked in the next 30
   days show up here").
   Why: a client can tell the difference between "empty" and "broken."

6. **Make the toast and error states theme-aware.** (S)
   The success toast is hard-coded dark (`bg-slate-900`); some error boxes lack a dark
   variant. Give both proper light/dark colors.
   Why: nothing should look broken or low-contrast in either theme.

7. **One header style across all screens.** (S)
   Settings re-implements a plain header while Notifications/Calendar/Billing use the
   navy hero. Put Settings on the same hero so the app feels like one product.

---

## Tier 2 — strong polish

8. **Haptics on the actions that matter.** (S)
   A short `navigator.vibrate?.(50)` on: mark Won, move stage, send message, create
   lead, and tab switch. Why: tactile confirmation makes the app feel native.

9. **"Updated Xm ago" on the Billing money.** (S)
   Reuse the Home freshness pattern on the Outstanding/Paid hero so a client trusts the
   numbers are current.

10. **Login first impression.** (S/M)
    Add a show/hide eye toggle on the password field, and move the error message up to
    eye level near the button instead of below the field. (Keep the test/admin links
    subtle: clients should not be nudged toward them.)
    Why: removes the "did I type that right?" anxiety on the very first screen.

11. **Composer comfort.** (S/M)
    Always show the character count (faint), grow the textarea from 2 to 3-4 rows, and
    fade the email subject field in when the channel switches. Why: typing feels roomy
    and considered, not cramped.

12. **Optimistic send feedback.** (M)
    Disable the textarea and show a spinner in Send while a message is in flight, then a
    quick success toast. Why: stops double-taps and the "did it send?" doubt.

13. **Date separators in the conversation thread.** (M)
    Group messages under "Today" / "Yesterday" / "Jun 22" headers and slightly enlarge
    the per-message time. Why: long threads become scannable.

14. **Guard against double-submit on the sheets.** (S)
    WonSheet and MoveStageSheet should disable their primary button while saving.
    Why: prevents accidental duplicate Won/move actions.

15. **Lead detail header divider + pending state on outcome buttons.** (S/M)
    Give the LeadDetail header a surface background and bottom border so it separates
    from content; show "Saving..." on Move-stage outcome buttons while the action runs.

16. **Pull-to-refresh "release to refresh" cue.** (S)
    Add a tiny label and a haptic tick when the user crosses the pull threshold, so the
    gesture has a clear commit point.

---

## Tier 3 — delight and discoverability

17. **Hint the hidden gestures.** (M)
    A faint chevron/grip on lead rows hints they are swipeable/tappable. Why: clients
    will not discover power features without a nudge.

18. **Subtle entrance motion.** (M)
    Stagger the board-skeleton columns and the lead-detail activity timeline so content
    cascades in. Why: a premium, intentional loading feel.

19. **Offline banner finesse.** (S)
    Fade the offline banner in instead of snapping, and auto-hide it when the connection
    returns. Why: less jarring.

20. **Clarify the notification permission ask.** (S)
    Tell the client how often to expect a buzz (e.g. "one buzz per new lead or message")
    so the prompt feels safe to accept.

21. **Clearer disabled action tiles on Contact detail.** (S)
    When Call/Text/Email are unavailable (no number/email), label them "Not available"
    rather than just greying out, so it does not read as a bug.

---

## Deliberately not on the list

- **Delivery checkmarks (sent/delivered/read)** need message-status data the API does
  not return today, so it is not a pure-UI change. Revisit with a backend pass.
- **Per-message sender labels** assume multi-person threads; this is a single client
  inbox, so it does not apply.
- **"Moved to Qualified, 3m ago" lead activity label** also needs a backend field
  (already noted from the first pass).
</content>
</invoke>
