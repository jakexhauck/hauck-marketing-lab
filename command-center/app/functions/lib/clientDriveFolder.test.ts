import { describe, it, expect, vi, afterEach } from "vitest";
import type { Env } from "./env";
import {
  CLIENT_FOLDER_PREFIX,
  clientFolderName,
  clientInitials,
  createClientFolder,
  templateCopyName,
} from "./clientDriveFolder";
import * as drive from "./driveComposio";

const ROOT = "195VBhcEi4ZHMUxr7yeyWeCIJo8WZC_7Y";
const SETUP = "1pG95hrqE06O9Dam-7IbGW7EO4Bl-dBze";

function doc(id: string, name: string, mimeType = "application/vnd.google-apps.document") {
  return {
    id,
    name,
    mimeType,
    isFolder: mimeType === "application/vnd.google-apps.folder",
    webViewLink: null,
    iconLink: null,
    thumbnailLink: null,
    modifiedTime: null,
    size: null,
  };
}

/** Drive as it answers for Willis: the client folder, Finished Creatives, and the setup folder. */
function mockDrive(templates: ReturnType<typeof doc>[] = []) {
  vi.spyOn(drive, "resolveDriveAccount").mockResolvedValue("acct");
  const folders = vi
    .spyOn(drive, "createDriveFolder")
    .mockResolvedValueOnce({ id: "fid", name: "🤝 | Willis Windows", webViewLink: "https://drive/fid" })
    .mockResolvedValueOnce({ id: "cid", name: "Finished Creatives", webViewLink: null });
  const list = vi.spyOn(drive, "listChildrenOfMany").mockResolvedValue(new Map([[SETUP, templates]]));
  const copy = vi
    .spyOn(drive, "copyDriveFile")
    .mockImplementation(async (_e, _a, _f, _p, name) => ({ id: "x", name, webViewLink: null }));
  return { folders, list, copy };
}

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
    const { folders } = mockDrive();

    const out = await createClientFolder(env(), "Willis Windows");

    expect(folders).toHaveBeenNthCalledWith(1, expect.anything(), "acct", ROOT, "🤝 | Willis Windows");
    expect(out.folder).toEqual({ folderId: "fid", name: "🤝 | Willis Windows", webViewLink: "https://drive/fid" });
    expect(out.warning).toBeNull();
  });

  it("uses the Hauck Marketing folder when no root is configured", async () => {
    const { folders } = mockDrive();
    await createClientFolder(env({ CLIENT_DRIVE_ROOT_FOLDER_ID: "" }), "Willis Windows");
    expect(folders).toHaveBeenNthCalledWith(1, expect.anything(), "acct", ROOT, "🤝 | Willis Windows");
  });

  it("adds Finished Creatives and a renamed copy of every setup doc", async () => {
    const { folders, copy } = mockDrive([doc("t1", "Copy | TEMPLATE"), doc("t2", "🛠️ Client Setup SOP")]);

    const out = await createClientFolder(env(), "Willis Windows");

    expect(folders).toHaveBeenNthCalledWith(2, expect.anything(), "acct", "fid", "Finished Creatives");
    expect(copy).toHaveBeenCalledWith(expect.anything(), "acct", "t1", "fid", "WW | Copy");
    expect(copy).toHaveBeenCalledWith(expect.anything(), "acct", "t2", "fid", "WW | 🛠️ Client Setup SOP");
    expect(out.warning).toBeNull();
  });

  it("skips folders and shortcuts in the setup folder", async () => {
    const { copy } = mockDrive([
      doc("t1", "Copy | TEMPLATE"),
      doc("f1", "Old", "application/vnd.google-apps.folder"),
      doc("s1", "Photos", "application/vnd.google-apps.shortcut"),
    ]);
    await createClientFolder(env(), "Willis Windows");
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it("keeps copying when one doc fails, and names the one that did", async () => {
    const { copy } = mockDrive([doc("t1", "Copy | TEMPLATE"), doc("t2", "Video Scripts | TEMPLATE")]);
    copy.mockRejectedValueOnce(new Error("rate limited"));

    const out = await createClientFolder(env(), "Willis Windows");

    expect(copy).toHaveBeenCalledTimes(2);
    expect(out.folder?.folderId).toBe("fid");
    expect(out.warning).toContain("WW | Copy was not copied");
  });

  it("still hands back the folder when the setup folder cannot be read", async () => {
    const { list } = mockDrive();
    list.mockRejectedValue(new Error("403"));

    const out = await createClientFolder(env(), "Willis Windows");

    expect(out.folder?.folderId).toBe("fid");
    expect(out.warning).toContain("setup templates could not be read");
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

describe("clientInitials", () => {
  it("takes the first letter of each word", () => {
    expect(clientInitials("Willis Windows")).toBe("WW");
    expect(clientInitials("Above All Garage Doors")).toBe("AAGD");
  });

  it("drops company endings", () => {
    expect(clientInitials("Made Better LC")).toBe("MB");
    expect(clientInitials("Smith Roofing, L.L.C.")).toBe("SR");
    expect(clientInitials("Acme inc.")).toBe("A");
  });

  it("keeps digits and skips symbols", () => {
    expect(clientInitials("5 Star Roofing")).toBe("5SR");
    expect(clientInitials("Smith & Sons")).toBe("SS");
  });

  it("never comes back empty", () => {
    expect(clientInitials("LLC")).toBe("L");
    expect(clientInitials("  ")).toBe("X");
  });
});

describe("templateCopyName", () => {
  it("swaps the TEMPLATE tag for the initials", () => {
    expect(templateCopyName("Copy | TEMPLATE", "WW")).toBe("WW | Copy");
    expect(templateCopyName("Client Dialing/Voicemail Script | TEMPLATE", "WW")).toBe(
      "WW | Client Dialing/Voicemail Script",
    );
    expect(templateCopyName("Video Scripts  |  template ", "WW")).toBe("WW | Video Scripts");
  });

  it("prefixes a doc with no tag", () => {
    expect(templateCopyName("🛠️ Client Setup SOP", "WW")).toBe("WW | 🛠️ Client Setup SOP");
  });
});
