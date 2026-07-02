# Paid Ads white-screen: what you need to do

Status: fix shipped + verified live 2026-07-02 (main `6f5fac1`, prod bundle `index-BWcptGBO.js`).

## What was actually wrong

Not the Paid Ads code. The app saves loaded data to the browser's local storage
(`hml_query_cache`) so screens reload instantly offline. An **old** version of the app
had saved a broken Paid Ads entry (`{ configured: false }` with no numbers). When the app
reopened, it showed that broken saved copy before refreshing it, and the Paid Ads screen
crashed to white on it. The earlier fix only cleaned data on a fresh network load, so it
never touched the saved copy. That is why it kept happening.

## What I shipped (now live, no action needed from you)

- The app now cleans the data on read, not just on fetch, so a broken saved copy can never
  crash the screen again.
- A one-time cache version bump makes every device throw away its old saved copy the first
  time it loads the new app.

Result: any device self-heals **the first time it loads the new version of the app.**

## What YOU need to do

The catch: an installed app (like Willis's Windows machine) can keep serving the OLD app
from its own cache until it is forced to update once. Until it loads the new version, it
still runs the old crashing code. So each already-installed device needs one nudge:

1. On Willis's Windows machine, open the app (or app.hauckmarketing.com).
2. Hard refresh once: press **Ctrl + Shift + R**.
3. Open **Paid Ads**. It should now show the "Not connected yet" notice with $0 tiles,
   not a blank screen.
4. If it is still blank after the hard refresh (stubborn installed app):
   - Press **F12** to open developer tools.
   - Go to the **Application** tab, then **Storage** on the left, then **Clear site data**.
   - Close and reopen the app, then check Paid Ads again.
5. Repeat on any other device that showed the white screen (phones, other staff logins).

After that one refresh per device, they are permanently fixed and future updates apply on
their own.

## How to confirm it worked

Paid Ads loads and shows the friendly cockpit with zeroed numbers and a "Not connected yet"
banner. No blank/white screen. (This is expected until the Meta ad account is actually
connected; the zeros are honest, not a bug.)
