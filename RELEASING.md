# Releasing Hauck Marketing Lab

The app auto-updates installed copies (Mac + Windows) by checking a manifest
hosted on GitHub Releases. To ship a new version, you build the app on each OS
that you want to support, then create a release with all the bundles plus a
`latest.json` manifest.

## One-time setup (already done)

- Signing keypair: `~/.tauri/hauck-marketing-lab.key` (private) and
  `~/.tauri/hauck-marketing-lab.key.pub` (public). The public key is embedded
  in `app/src-tauri/tauri.conf.json`. Back up the private key somewhere safe;
  if you lose it, existing installs will reject your updates and you'll have to
  re-issue keys and have everyone reinstall.
- Updater endpoint:
  `https://github.com/jakexhauck/hauck-marketing-lab/releases/latest/download/latest.json`
- GitHub CLI (`gh`) installed and authenticated. If not: `brew install gh` then
  `gh auth login`.

## Each release

### 1. Bump the version

On your Mac, from the `app/` directory:

```bash
node scripts/bump-version.mjs 0.2.0
```

This updates `package.json`, `tauri.conf.json`, and `Cargo.toml`. Commit the
bump.

```bash
git add -A && git commit -m "Release v0.2.0" && git push
```

### 2. Build on Mac

From `app/`:

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/hauck-marketing-lab.key)" \
  npm run tauri build
```

Bundles land in `app/src-tauri/target/release/bundle/`:
- `macos/Hauck Marketing Lab.app.tar.gz` + `.sig` — updater payload
- `dmg/Hauck Marketing Lab_0.2.0_aarch64.dmg` — what you give people to
  install fresh

Copy the `.app.tar.gz` + `.sig` into a release staging folder (e.g.
`~/Desktop/release-0.2.0/`), renaming to include the arch so it doesn't
collide with the Windows version:

```bash
mkdir -p ~/Desktop/release-0.2.0
cp "app/src-tauri/target/release/bundle/macos/Hauck Marketing Lab.app.tar.gz" \
   ~/Desktop/release-0.2.0/Hauck-Marketing-Lab_aarch64.app.tar.gz
cp "app/src-tauri/target/release/bundle/macos/Hauck Marketing Lab.app.tar.gz.sig" \
   ~/Desktop/release-0.2.0/Hauck-Marketing-Lab_aarch64.app.tar.gz.sig
cp "app/src-tauri/target/release/bundle/dmg/"*.dmg ~/Desktop/release-0.2.0/
```

### 3. Build on Windows

On the Windows machine, `git pull` the version bump, then from `app\`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $HOME\.tauri\hauck-marketing-lab.key -Raw
npm run tauri build
```

(You'll need to copy your `~/.tauri/hauck-marketing-lab.key` over to the
Windows machine once — same path, same content. Keep it private.)

Bundles land in `app\src-tauri\target\release\bundle\`:
- `nsis\Hauck Marketing Lab_0.2.0_x64-setup.exe` + `.sig` — installer + updater
  payload (Tauri v2 uses the NSIS installer as the updater artifact on Windows)

Copy them to the release staging folder. Easiest is to push them to a shared
Dropbox / Drive folder, or use `scp` back to the Mac.

### 4. Assemble the manifest

Back on the Mac, with all bundles in `~/Desktop/release-0.2.0/`:

```bash
cd app
node scripts/make-latest-json.mjs ~/Desktop/release-0.2.0 \
  --notes "Bug fixes and improvements"
```

This writes `latest.json` into the same folder, with embedded signatures and
URLs that point at the GitHub Release for tag `v0.2.0`.

### 5. Create the GitHub Release

```bash
gh release create v0.2.0 ~/Desktop/release-0.2.0/* \
  --title "v0.2.0" \
  --notes "Bug fixes and improvements"
```

That's it. Within a few seconds, any installed copy (Mac or Windows) that
launches will see the new version and show the "Install & restart" prompt.

## Sanity checks

- After publishing, open the GitHub Release page and confirm `latest.json` is
  attached and the platform URLs in it resolve (click them — they should
  download the bundles).
- Launch the existing installed app. The on-launch updater check fires 3
  seconds after startup. You can also force it from **Settings → Build →
  Updates → Check for updates**.

## When things go wrong

- **"signature verification failed"** in the installed app → the bundle was
  built without the private key set, or you regenerated the keypair without
  updating `tauri.conf.json`. Rebuild with the env var set and republish.
- **No update prompt appears** → check that the GitHub Release is tagged
  `v<version>` (not just `<version>`) and that `latest.json` is in the release
  assets. Open the URL in a browser:
  `https://github.com/jakexhauck/hauck-marketing-lab/releases/latest/download/latest.json` —
  it should serve the JSON.
- **macOS "unidentified developer"** warning on first install → right-click the
  `.dmg` and choose Open. Apple Developer ID ($99/yr) removes this; for personal
  use the workaround is fine.
- **Windows SmartScreen** warning on first install → click "More info" → "Run
  anyway". Code-signing cert removes this; same tradeoff.
