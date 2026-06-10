# Part 4: Your Manual Actions

Do these only after Claude reports Part 4 implementation complete. You need a phone with the PWA installed (Add to Home Screen) for the real tests; the iOS Safari install is the strictest and most representative. Click paths are in the [Software Guide](../SOFTWARE-GUIDE.md).

## Manual actions checklist (do these, in this order)

### A. Ship it

- [ ] 1. Read Claude's Part 4 report
- [ ] 2. Tell Claude: **"commit and push Part 4"** (Guide Recipe D)
- [ ] 3. Watch the deployment turn green (Guide Recipe C)

### B. Service worker update test (the deploy-reaches-phones proof)

- [ ] 4. On your phone, open the installed PWA, browse two screens, then close it (swipe away)
- [ ] 5. Ask Claude to make a trivial visible change (e.g. bump a version string shown on the Login screen footer) and **"commit and push"** it
- [ ] 6. After the deploy is green, reopen the installed PWA. Expected: within one open/close cycle (at most one extra relaunch) the change is visible. Before Part 4 this never happened without deleting the app

### C. Offline test

- [ ] 7. With the PWA open and signed in (test mode), browse Home, Leads, and one conversation so caches warm up
- [ ] 8. Enable **Airplane Mode**, kill the app, relaunch it. Expected: you stay signed in, the offline banner shows, Home/Leads render the last cached data. NOT expected: the login screen
- [ ] 9. Tap into a cached conversation. Expected: cached messages render; sending is unavailable or fails gracefully with a clear message
- [ ] 10. Disable Airplane Mode. Expected: within ~30 seconds fresh data replaces cached data and the banner clears

### D. Freshness after actions

- [ ] 11. Send an SMS from a conversation. Expected: your message appears in the thread immediately after send, not 10 to 20 seconds later

### E. Session and mode hygiene

- [ ] 12. Log out. Log back in. Expected: no flash of the previous session's data anywhere (Home stats, leads, notifications)
- [ ] 13. Expired-session behavior: ask Claude to **"run the 401 simulation"** (Claude clears your session cookie server-side or you clear the cookie in browser devtools on desktop). Expected: the app returns you to the login screen instead of showing endless "Failed to load" panels
- [ ] 14. Identity fallback: with the app open, ask Claude to temporarily break the identity endpoint is NOT needed; skip unless investigating, this path is covered by code review

### F. Push lifecycle

- [ ] 15. Enable notifications in the app on the phone, then fire a test webhook (ask Claude to **"send a test inbound webhook"**). Expected: OS notification arrives when the app is closed; when the app is OPEN and focused, no OS banner, but the bell badge updates within a second or two
- [ ] 16. Tap an OS notification. Expected: the app opens straight to the right lead/conversation, with a loading spinner at worst, never "Lead not found"
- [ ] 17. Log out, then fire another test webhook. Expected: NO notification arrives on the logged-out phone
- [ ] 18. Log back in and re-enable notifications via the prompt. Expected: the prompt offers re-enabling and it works

### G. Close out

- [ ] 19. Anything unexpected: paste exact behavior to Claude
- [ ] 20. Tick Part 4's two boxes in [../README.md](../README.md)
- [ ] 21. Tell Claude: **"start Part 5"**

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Step 6 still shows old version | iOS may need one full extra close/open cycle; verify the deploy actually finished | Close fully (swipe away), reopen; check deployment timestamp |
| Step 8 shows login screen | auth/me cache miss (first offline run after deploy) | Go online once, browse, retry airplane mode |
| Step 15 badge does not update while open | postMessage path broken | Tell Claude; check SW logs via desktop devtools Application tab |
| Step 17 still receives pushes | unsubscribe failed silently at logout | Tell Claude; check push_subscriptions rows in Supabase |
