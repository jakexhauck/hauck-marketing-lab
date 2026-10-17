import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRANDS_DIR, brandFor } from "../video/brand.ts";
import { BUILD_SCRIPT } from "../src/video.ts";

// The regression gate from the plan, the build half: the moved template, with
// AAG's brand, must write the same page the old one did for each of the nine
// AAG ads. Only on this PC, where the old project folder lives. The render
// half (frame count, duration, a 3s frame) was run by hand on 2026-10-17;
// rendering is too heavy for a test run.
const AAG = "C:/Users/games/Desktop/aag-video-ads";
const ADS = ["ad1-vid1", "ad5-hey-im-ryan", "ad8-days-estimate", "ad9-funny"];

describe.skipIf(!existsSync(join(AAG, "template", "ads")))("AAG regression (build)", () => {
  const out = mkdtempSync(join(tmpdir(), "aag-reg-"));
  const brandFile = join(out, "brand.json");
  writeFileSync(
    brandFile,
    JSON.stringify(
      brandFor("above-all-garage-doors", {
        vaultFolder: join(import.meta.dirname, "fixtures", "vault-aag"),
        name: "Above All Garage Doors",
        brandsDir: BRANDS_DIR,
        assetsDir: join(out, "assets"),
      }),
    ),
  );

  for (const ad of ADS) {
    it(`rebuilds ${ad} byte for byte`, () => {
      const cfgFile = join(AAG, "template", "ads", `${ad}.json`);
      const cfg = JSON.parse(readFileSync(cfgFile, "utf8"));
      const dir = join(out, cfg.id);
      execFileSync(process.execPath, [
        BUILD_SCRIPT, cfgFile,
        "--brand", brandFile,
        "--proxy", join(AAG, "work", "proxies", `${cfg.source}.mp4`),
        "--transcript", join(AAG, "work", "tx", `${cfg.source}.json`),
        "--out", dir,
      ], { stdio: "pipe" });
      expect(readFileSync(join(dir, "index.html"), "utf8")).toBe(readFileSync(join(AAG, "videos", cfg.id, "index.html"), "utf8"));
      expect(readFileSync(join(dir, "snap-times.txt"), "utf8")).toBe(readFileSync(join(AAG, "videos", cfg.id, "snap-times.txt"), "utf8"));
    }, 60_000);
  }
});
