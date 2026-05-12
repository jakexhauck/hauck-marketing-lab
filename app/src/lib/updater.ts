import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateCheckResult =
  | { kind: "available"; update: Update }
  | { kind: "up-to-date" }
  | { kind: "no-releases-yet" }
  | { kind: "error"; message: string };

function isNoReleasesError(raw: string): boolean {
  // Tauri throws this when the endpoint 404s — typical before the first
  // release is published. We also catch the generic "404" and "not found".
  const s = raw.toLowerCase();
  return (
    s.includes("could not fetch a valid release json") ||
    s.includes("404") ||
    s.includes("not found")
  );
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    if (update) return { kind: "available", update };
    return { kind: "up-to-date" };
  } catch (e) {
    const message = String(e);
    if (isNoReleasesError(message)) return { kind: "no-releases-yet" };
    return { kind: "error", message };
  }
}

export async function installAndRestart(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
