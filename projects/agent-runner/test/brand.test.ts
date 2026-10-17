import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRANDS_DIR, brandFor, DEFAULT_COLORS, vaultFacts } from "../video/brand.ts";

// A copy of vault/Clients/Above All Garage Doors/Memory.md as of 2026-10-17.
const AAG_VAULT = join(import.meta.dirname, "fixtures", "vault-aag");

const tmp = () => mkdtempSync(join(tmpdir(), "brand-"));

describe("vaultFacts", () => {
  it("reads the on-screen facts out of the AAG Memory note", () => {
    const f = vaultFacts(
      [
        "- 2026-10-07: Owner on camera is **Ryan**.",
        "- 2026-10-07: Google rating **4.9 stars from 120+ reviews** (Jake confirmed, safe to put on screen).",
        '- 2026-10-07: Ad CTA: **"Tap Learn More for a free same-day estimate."**',
        "- 2026-10-07: Brand assets (logos .ai/.svg/.png, job photos): `G:\\x\\Photos`",
      ].join("\n"),
    );
    expect(f).toEqual({
      ownerName: "Ryan",
      rating: "4.9",
      reviews: "120+",
      cta: "Tap Learn More",
      offer: "Free same-day estimate",
      offerHtml: "Free same-day estimate",
      photosDir: "G:\\x\\Photos",
    });
  });

  it("leaves out what the notes do not say", () => {
    expect(vaultFacts("Prefers texts over calls.")).toEqual({});
  });
});

describe("brandFor", () => {
  it("gives AAG's brand from its vault notes and its brands file", () => {
    const assetsDir = tmp();
    const b = brandFor("above-all-garage-doors", {
      vaultFolder: AAG_VAULT,
      name: "Above All Garage Doors",
      brandsDir: BRANDS_DIR,
      assetsDir,
    });
    expect(b.name).toBe("Above All Garage Doors");
    // The vault says "Ryan"; the card has always shown his full name.
    expect(b.ownerName).toBe("Ryan Michael");
    expect(b.rating).toBe("4.9");
    expect(b.reviews).toBe("120+");
    expect(b.cta).toBe("Tap Learn More");
    expect(b.offer).toBe("Free same-day estimate");
    expect(b.offerHtml).toBe("Free <span>same-day</span> estimate");
    expect(b.colors).toEqual(DEFAULT_COLORS);
    expect(b.photosDir.replace(/\\/g, "/")).toMatch(/aag-video-ads\/template\/photos$/);
  });

  it("builds a new client from the vault alone, assets in its own folder", () => {
    const vault = tmp();
    writeFileSync(join(vault, "Memory.md"), "- Owner on camera is **Bill**.\n- **5 stars from 41 reviews**\n");
    const assetsDir = tmp();
    const b = brandFor("clear-choice-windows", { vaultFolder: vault, name: "Clear Choice Windows", brandsDir: tmp(), assetsDir });
    expect(b.ownerName).toBe("Bill");
    expect(b.rating).toBe("5.0");
    expect(b.reviews).toBe("41");
    expect(b.photosDir).toBe(join(assetsDir, "photos"));
    expect(b.logoPath).toBe(join(assetsDir, "logo.png"));
  });

  it("lets the agent's brand.json override the rest, colours merged", () => {
    const assetsDir = tmp();
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, "brand.json"), JSON.stringify({ location: "Owensboro, KY", colors: { accent: "#ff6600" } }));
    const b = brandFor("clear-choice-windows", { vaultFolder: null, name: "Clear Choice Windows", brandsDir: tmp(), assetsDir });
    expect(b.location).toBe("Owensboro, KY");
    expect(b.colors.accent).toBe("#ff6600");
    expect(b.colors.ink).toBe(DEFAULT_COLORS.ink);
  });
});
