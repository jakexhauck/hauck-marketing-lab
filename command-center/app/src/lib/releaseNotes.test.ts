import { describe, expect, it } from "vitest";
import {
  RELEASES,
  latestRelease,
  seenStorageKey,
  unseenReleases,
} from "./releaseNotes";

describe("RELEASES", () => {
  it("has at least one release", () => {
    expect(RELEASES.length).toBeGreaterThan(0);
  });

  it("has unique ids", () => {
    // A duplicate id would make "seen up to here" ambiguous and could hide a
    // release nobody ever saw.
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every release a title, a date and something a person can do", () => {
    for (const release of RELEASES) {
      expect(release.id.length).toBeGreaterThan(0);
      expect(release.title.length).toBeGreaterThan(0);
      expect(release.date.length).toBeGreaterThan(0);
      expect(release.items.length).toBeGreaterThan(0);
      for (const item of release.items) expect(item.length).toBeGreaterThan(0);
    }
  });

  it("uses no em dashes, per the house rule", () => {
    for (const release of RELEASES) {
      expect(release.title).not.toContain("—");
      for (const item of release.items) expect(item).not.toContain("—");
    }
  });
});

describe("latestRelease", () => {
  it("is the first entry, since the list is newest first", () => {
    expect(latestRelease()).toBe(RELEASES[0]);
  });
});

describe("unseenReleases", () => {
  it("shows a first-time viewer the latest release only, not the whole history", () => {
    expect(unseenReleases(null)).toEqual(RELEASES.slice(0, 1));
    expect(unseenReleases(undefined)).toEqual(RELEASES.slice(0, 1));
    expect(unseenReleases("")).toEqual(RELEASES.slice(0, 1));
  });

  it("shows nothing to someone already caught up", () => {
    expect(unseenReleases(RELEASES[0].id)).toEqual([]);
  });

  it("shows only what is newer than the release they saw", () => {
    // Built from the real list so the assertion holds as releases are added.
    const older = RELEASES[RELEASES.length - 1];
    expect(unseenReleases(older.id)).toEqual(RELEASES.slice(0, RELEASES.length - 1));
  });

  it("falls back to the latest when the stored id is no longer known", () => {
    // A renamed or removed release must not leave someone permanently silent.
    expect(unseenReleases("a-release-that-no-longer-exists")).toEqual(
      RELEASES.slice(0, 1),
    );
  });
});

describe("seenStorageKey", () => {
  it("is per person", () => {
    expect(seenStorageKey("zach")).not.toBe(seenStorageKey("jake"));
  });

  it("is stable for the same person", () => {
    expect(seenStorageKey("zach")).toBe(seenStorageKey("zach"));
  });

  it("does not let an unidentified session answer for a real account", () => {
    const anon = seenStorageKey(null);
    expect(anon).toBe(seenStorageKey(undefined));
    expect(anon).toBe(seenStorageKey(""));
    expect(anon).not.toBe(seenStorageKey("zach"));
  });
});
