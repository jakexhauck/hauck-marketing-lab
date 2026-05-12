# Quick — Picking up on Windows

Run these in order. PowerShell or Git Bash both work.

## 1. Pull the latest

```
cd C:\Users\<you>\Desktop\hauck-marketing-lab
git pull
```

## 2. Install any new JS deps

```
cd app
pnpm install
```

## 3. Build the Windows installer

```
pnpm tauri build
```

Output lands in `app\src-tauri\target\release\bundle\` (look in `msi\` or `nsis\` — whichever your `tauri.conf.json` is set to).

## 4. Install the new build

Double-click the `.msi` (or `.exe` if NSIS). Replace when prompted.

## 5. Smoke test

Open the app and check:

1. **Settings → About** — Jake.md and Hauck Marketing.md should load with real content. (Before the fix, these were silently empty.)
2. **Edit a line in About Jake → Save** — open `vault\About\Jake.md` in Obsidian, confirm the edit is there.
3. **Chat with Willis Windows** — type `/remember Test from Windows` and hit Enter. Open `vault\Clients\Willis Windows\Memory.md` in Obsidian, confirm the bullet appears at the top of `## Facts`.
4. **Clients → Edit profile (Willis Windows)** — change a field → Save → verify it lands in `vault\Clients\Willis Windows\Profile.md`.

If any of those four don't work, something didn't sync — re-run step 1 and check the latest commit is `a843714` (`git log --oneline -1`).

## Reminders

- The Obsidian vault lives at `hauck-marketing-lab\vault\` (project root, **not** inside `media-buying\`). Open that folder in Obsidian.
- The app's picked folder should still be `hauck-marketing-lab\media-buying\`. Don't change it — `vault_root()` now resolves the sibling automatically.
- Root `CLAUDE.md` is now a pointer stub. Edit identity / voice / ad-copy rules in `vault\About\Jake.md` and `vault\About\Hauck Marketing.md` (via Settings → About, or directly in Obsidian).
