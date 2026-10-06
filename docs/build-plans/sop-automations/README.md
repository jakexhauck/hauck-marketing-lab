# SOP automations: index

Source: the Client Setup SOP review (Jake, 2026-10-05/06). Every page lives inside a client's sub-account (client strip, `lib/clientNav.ts`).

## Picked (Jake, 2026-10-06)

| # | Plan | Kind | Where it lives |
|---|---|---|---|
| 0 | [Claude in the app](00-claude-in-app.md) | Foundation for 1, 2, 4 | Backend only |
| 1 | [Long Term Nurture texts](01-ltn-texts.md) | Copy pack | GHL > Follow-up Texts |
| 2 | [Lead form follow-up texts](02-lead-form-fu-texts.md) | Copy pack | GHL > Follow-up Texts |
| 3 | [Custom values sheet](03-custom-values-sheet.md) | Copy pack + push | GHL > Custom Values |
| 4 | [Dialing script](04-dialing-script.md) | Copy pack | Setter Suite > Settings |
| 5 | [Lead form into Meta](05-lead-form-to-meta.md) | Automation | Paid Ads > Ad Builder > Lead Form |
| 6 | [Fill the copied Drive docs](06-fill-client-docs.md) | Automation | Onboarding > client folder card |
| 7 | [CAPI values](07-capi-values.md) | Store + copy | GHL > CAPI |

Dropped: the Meta campaign builder (Jake: "i dont want to automate the meta campaign yet").
Already built, no plan: copying the Client Setup docs into the client folder (the Create client folder button does it).

## Decisions (Jake, 2026-10-06)

- Copy is written by Claude inside the app (one click), not a hand-over prompt.
- Lead form follow-ups: personalise the first text, SMS 3 and the Hail Mary per client. Recent Work and Owner Story texts stay universal.
- CAPI: just store the Dataset ID and token per client, with copy buttons.
- Copied Drive docs: fill the `[SQUARE BRACKET]` spots with the client's details.
- Base dialing script: the "Client Dialing/Voicemail Script | TEMPLATE" doc in 🚀 Client Setup.

## Build order

0 first (1, 2 and 4 need it). Then 3 and 7 (no AI, quick). Then 1 + 2 (one page). Then 4, 5, 6.

## Shared rules for every plan

- Built in a worktree, spec + plan in the same doc, `git rm` the doc in the shipping commit.
- Migration numbers (0140 to 0145) are placeholders: other sessions add migrations, so take the next free number at build time.
- No em dashes, no sub-text under headings, labels are nouns.
- Every admin-facing change adds a `RELEASES` entry in `releaseNotes.ts`.
- Every new client page: a `ClientPageId` / row in `clientNavGroups`, a `PageBody` case in `ClientPage.tsx`, an icon in `clientRowIcons.ts`, tests in `clientNav.test.ts`.
- New UI gets 2 to 3 mockups first (Jake picks).
- Update `blueprint/index.html`.

## Jake owes before building

Done 2026-10-06: Anthropic key in Doppler (works), AAG Page reachable by the system user, OK for the Willis test form.

1. Take the GHL password out of the 🛠️ Client Setup SOP (the folder button copies that doc into every client folder) and change the password.
