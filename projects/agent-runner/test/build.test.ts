import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brandFor } from "../video/brand.ts";
import { BUILD_SCRIPT } from "../src/video.ts";

// video/build.mjs for real, on a tiny ad. The config is the Creative Agent's
// own writing, so everything in it is treated as untrusted text.

const WORDS = [
  { text: "Hey,", start: 0.5, end: 0.8 },
  { text: "I'm", start: 0.9, end: 1.1 },
  { text: "Ryan.", start: 1.2, end: 1.6 },
];

function build(cfg: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), "build-"));
  const assetsDir = join(root, "brand");
  mkdirSync(join(assetsDir, "photos"), { recursive: true });
  writeFileSync(join(assetsDir, "photos", "endcard.jpg"), "jpg");
  writeFileSync(join(assetsDir, "photos", "van.jpg"), "jpg");
  writeFileSync(join(assetsDir, "logo.png"), "png");
  writeFileSync(join(root, "secret.jpg"), "secret");
  const brandFile = join(root, "brand.json");
  writeFileSync(brandFile, JSON.stringify(brandFor("test-co", { vaultFolder: null, name: "Test Co", brandsDir: root, assetsDir })));
  const proxy = join(root, "src.mp4");
  writeFileSync(proxy, "mp4");
  const transcript = join(root, "words.json");
  writeFileSync(transcript, JSON.stringify(WORDS));
  const cfgFile = join(root, "ad.json");
  writeFileSync(cfgFile, JSON.stringify({ id: "t1", source: "hey", title: "T", segments: [[0, 2]], overlays: [], ...cfg }));
  const out = join(root, "out");
  const r = spawnSync(process.execPath, [BUILD_SCRIPT, cfgFile, "--brand", brandFile, "--proxy", proxy, "--transcript", transcript, "--out", out], {
    encoding: "utf8",
  });
  const html = r.status === 0 ? readFileSync(join(out, "index.html"), "utf8") : "";
  return { code: r.status, stderr: r.stderr, html };
}

describe("build.mjs with untrusted config text", () => {
  it("escapes overlay text, keeps a bold word, and keeps a fix out of the script tag", () => {
    const { code, stderr, html } = build({
      title: "T --> <script>alert(0)</script>",
      fixes: { "I'm": "</script><script>alert(3)</script>" },
      overlays: [
        { type: "text", at: "Hey", dur: 0.3, text: '<img src=x onerror="alert(1)">' },
        { type: "notif", at: "Hey", dur: 0.3, msg: "Reply <b>fast</b> <script>alert(2)</script>" },
        { type: "photo", at: "Hey", dur: 0.3, photo: "van", chip: "<i>chip</i>" },
      ],
    });
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("Reply <b>fast</b> &lt;script&gt;alert(2)&lt;/script&gt;");
    expect(html).toContain("&lt;i&gt;chip&lt;/i&gt;");
    expect(html).not.toMatch(/<script>alert/);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("T --&gt; &lt;script&gt;alert(0)&lt;/script&gt;");
  });

  it("refuses a number field that is not a number", () => {
    const r = build({ overlays: [{ type: "text", at: "Hey", dur: 0.3, text: "x", rot: "0});alert(1);//" }] });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/not a number/);
  });

  it("refuses a camera position that could leave its string", () => {
    const r = build({ face: '1%"});alert(1);//' });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/not a position/);
  });

  it("refuses a sound it does not have", () => {
    const r = build({ overlays: [{ type: "text", at: "Hey", dur: 0.3, text: "x", sound: '" onload="alert(1)' }] });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/not a sound/);
  });

  it("takes plain photo names only, from inside the photos folder", () => {
    for (const photo of ["../secret", "..", "a/b", "C:/x", "a\\b"]) {
      const r = build({ overlays: [{ type: "photo", at: "Hey", dur: 0.3, photo }] });
      expect(r.code, photo).not.toBe(0);
      expect(r.stderr, photo).toMatch(/photo not found: .*not a plain photo name/);
    }
  });
});
