import { describe, it, expect, vi, afterEach } from "vitest";
import type { Env } from "./env";
import { CLIENT_FOLDER_PREFIX, clientFolderName, createClientFolder } from "./clientDriveFolder";
import * as drive from "./driveComposio";

const ROOT = "195VBhcEi4ZHMUxr7yeyWeCIJo8WZC_7Y";

function env(over: Partial<Env> = {}): Env {
  return { COMPOSIO_API_KEY: "key", CLIENT_DRIVE_ROOT_FOLDER_ID: ROOT, ...over } as Env;
}

afterEach(() => vi.restoreAllMocks());

describe("clientFolderName", () => {
  it("matches the convention already in the Drive", () => {
    expect(clientFolderName("Willis Windows")).toBe(`${CLIENT_FOLDER_PREFIX}Willis Windows`);
  });

  it("tidies what Drive would choke on or render oddly", () => {
    expect(clientFolderName("  Willis   Windows  ")).toBe(`${CLIENT_FOLDER_PREFIX}Willis Windows`);
    expect(clientFolderName("Heating/Cooling")).toBe(`${CLIENT_FOLDER_PREFIX}Heating-Cooling`);
  });
});

describe("createClientFolder", () => {
  it("creates the folder under the configured root", async () => {
    const spy = vi
      .spyOn(drive, "createDriveFolder")
      .mockResolvedValue({ id: "fid", name: "🤝 | Willis Windows", webViewLink: "https://drive/fid" });
    vi.spyOn(drive, "resolveDriveAccount").mockResolvedValue("acct");

    const out = await createClientFolder(env(), "Willis Windows");

    expect(spy).toHaveBeenCalledWith(expect.anything(), "acct", ROOT, "🤝 | Willis Windows");
    expect(out.folder).toEqual({ folderId: "fid", name: "🤝 | Willis Windows", webViewLink: "https://drive/fid" });
    expect(out.warning).toBeNull();
  });

  // Losing a client's owner login because Drive was rate limited would be an
  // absurd trade, so every failure below is a warning and never a throw.
  it("warns instead of throwing when Drive fails", async () => {
    vi.spyOn(drive, "resolveDriveAccount").mockRejectedValue(
      new Error("Google Drive is not connected yet."),
    );

    const out = await createClientFolder(env(), "Willis Windows");

    expect(out.folder).toBeNull();
    expect(out.warning).toContain("not connected");
  });

  it("says so when the root folder is not configured", async () => {
    const out = await createClientFolder(env({ CLIENT_DRIVE_ROOT_FOLDER_ID: "" }), "Willis Windows");
    expect(out.folder).toBeNull();
    expect(out.warning).toContain("CLIENT_DRIVE_ROOT_FOLDER_ID");
  });

  it("rejects a root that is not a folder id, rather than asking Drive", async () => {
    const spy = vi.spyOn(drive, "resolveDriveAccount");
    const out = await createClientFolder(
      env({ CLIENT_DRIVE_ROOT_FOLDER_ID: "https://drive.google.com/drive/folders/abc" }),
      "Willis Windows",
    );
    expect(out.folder).toBeNull();
    expect(out.warning).toContain("not a Drive folder id");
    expect(spy).not.toHaveBeenCalled();
  });

  it("says so when Composio is not configured", async () => {
    const out = await createClientFolder(env({ COMPOSIO_API_KEY: "" }), "Willis Windows");
    expect(out.folder).toBeNull();
    expect(out.warning).toContain("not configured");
  });
});
