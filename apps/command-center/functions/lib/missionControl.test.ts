import { describe, it, expect } from "vitest";
import { matchClientFolder } from "./clientDriveFolder";
import { missionControlDocName, missionControlEmbedUrl } from "./missionControl";

describe("missionControlDocName", () => {
  it("prefixes the client's initials, the way Jake named Comfort Wizards' copy", () => {
    expect(missionControlDocName("Comfort Wizards LLC")).toBe("CW // Mission Control");
    expect(missionControlDocName("Willis Windows")).toBe("WW // Mission Control");
  });
});

describe("missionControlEmbedUrl", () => {
  it("opens the plain editor, which is what the Brief frames", () => {
    expect(missionControlEmbedUrl("abc123")).toBe("https://docs.google.com/document/d/abc123/edit");
  });
});

describe("matchClientFolder", () => {
  // The client root on 2026-10-26.
  const root = [
    "New Client Setup 🚀",
    "⚙️ | Agency SOPS",
    "🤝 | Above All Garage Doors",
    "🤝 | Clear Choice Owensboro",
    "🤝 | Comfort Wizards LLC",
    "🤝 | Ecofficient Heating & Cooling",
    "🤝 | Made Better LC",
    "🤝 | Willis Windows",
  ].map((name) => ({ name }));
  const pick = (client: string) => matchClientFolder(root, client)?.name ?? null;

  it("finds a folder named after the client", () => {
    expect(pick("Willis Windows")).toBe("🤝 | Willis Windows");
    expect(pick("Comfort Wizards LLC")).toBe("🤝 | Comfort Wizards LLC");
    expect(pick("Comfort Wizards")).toBe("🤝 | Comfort Wizards LLC");
  });

  it("finds a folder named a little differently", () => {
    expect(pick("Made Better Landscaping Co")).toBe("🤝 | Made Better LC");
  });

  it("never guesses across different names or outside the client folders", () => {
    expect(pick("Clear Choice Windows")).toBeNull();
    expect(pick("TNT Garage Doors & Openers")).toBeNull();
    expect(pick("New Client Setup")).toBeNull();
  });

  it("gives up when two folders could be the client", () => {
    expect(matchClientFolder([{ name: "🤝 | Acme East" }, { name: "🤝 | Acme West" }], "Acme")).toBeNull();
  });
});
