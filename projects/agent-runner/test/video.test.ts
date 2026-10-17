import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProject,
  BuildError,
  fixableBuildError,
  frameTimes,
  HYPERFRAMES,
  inside,
  npxEnv,
  proxyArgs,
  render,
  renderArgs,
  safeName,
  transcribe,
  transcriptLines,
  workPaths,
  type Exec,
} from "../src/video.ts";
import { within } from "../src/paths.ts";

function fakeExec(answer: (cmd: string, args: string[]) => { code?: number; stdout?: string; stderr?: string } = () => ({})) {
  const calls: { cmd: string; args: string[]; cwd?: string }[] = [];
  const x: Exec = async (cmd, args, opts) => {
    calls.push({ cmd, args, cwd: opts?.cwd });
    const a = answer(cmd, args);
    return { code: a.code ?? 0, stdout: a.stdout ?? "", stderr: a.stderr ?? "" };
  };
  return { x, calls };
}

describe("inside", () => {
  it("accepts the folder and anything under it", () => {
    expect(inside("C:/drive/AAG/clip.mov", "C:/drive/AAG")).toBe(true);
    expect(inside("C:/drive/AAG", "C:/drive/AAG")).toBe(true);
  });
  it("refuses a way out, a sibling with the same prefix, and another drive", () => {
    expect(inside("C:/drive/AAG/../Willis/clip.mov", "C:/drive/AAG")).toBe(false);
    expect(inside("C:/drive/AAG2/clip.mov", "C:/drive/AAG")).toBe(false);
    expect(inside("D:/clip.mov", "C:/drive/AAG")).toBe(false);
  });
});

describe("safeName", () => {
  it("takes lowercase words and dashes only", () => {
    expect(safeName("hey-im-ryan")).toBe("hey-im-ryan");
    for (const bad of ["../x", "Hey", "a b", "", "-x", 5, null]) expect(safeName(bad)).toBeNull();
  });
});

describe("within and workPaths", () => {
  it("joins only strictly inside the root", () => {
    expect(within("C:/w", "tx", "a.json")).toBe(join("C:/w", "tx", "a.json"));
    for (const bad of [["../x"], ["tx", "..", ".."], [""], ["C:/elsewhere"], ["a/../../b"]]) {
      expect(() => within("C:/w", ...bad)).toThrow(/not inside/);
    }
  });
  it("refuses a clip name that climbs out", () => {
    expect(() => workPaths("C:/w", "../../bin")).toThrow();
    expect(workPaths("C:/w", "hey").proxy).toBe(join("C:/w", "proxies", "hey.mp4"));
  });
});

describe("pipeline args", () => {
  it("proxies to 1080x1920 at 30fps with a keyframe every second", () => {
    const a = proxyArgs("in.mov", "out.mp4");
    expect(a).toContain("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
    expect(a[a.indexOf("-r") + 1]).toBe("30");
    expect(a[a.indexOf("-g") + 1]).toBe("30");
    expect(a.at(-1)).toBe("out.mp4");
  });

  it("renders with the pinned HyperFrames: draft previews, standard finals", () => {
    expect(renderArgs("p", "final", "o.mp4")).toEqual(["--yes", HYPERFRAMES, "render", "p", "-q", "standard", "--workers", "2", "-o", "o.mp4"]);
    expect(renderArgs("p", "preview", "o.mp4")).toContain("draft");
    expect(HYPERFRAMES).toBe("hyperframes@0.8.140");
  });

  it("spaces stills away from the ends", () => {
    expect(frameTimes(50, 4)).toEqual([10, 20, 30, 40]);
  });
});

describe("transcriptLines", () => {
  it("breaks on pauses and marks them", () => {
    const out = transcriptLines([
      { text: "Hey,", start: 9.84, end: 10.56 },
      { text: "I'm", start: 10.56, end: 10.96 },
      { text: "Ryan", start: 12.0, end: 12.4 },
    ]);
    expect(out).toBe("9.84-10.96  Hey, I'm\n[pause 1.0s]\n12.00-12.40  Ryan");
  });
});

describe("fixableBuildError", () => {
  it("picks out the errors a config edit fixes", () => {
    expect(fixableBuildError('Error: phrase not found: "make loud noises" (after 0)\n    at findPhrase')).toBe(
      'phrase not found: "make loud noises" (after 0)',
    );
    expect(fixableBuildError('Error: photo not found: "van" (no van.jpg in C:/x)')).toBe('photo not found: "van" (no van.jpg in C:/x)');
    expect(fixableBuildError("Error: ENOSPC")).toBeNull();
  });
});

describe("buildProject", () => {
  const input = { config: "c.json", brandFile: "b.json", proxy: "p.mp4", transcript: "t.json", out: "o" };

  it("runs build.mjs with every path as a flag", async () => {
    const { x, calls } = fakeExec(() => ({ stdout: "ad: 8 clips\n" }));
    expect(await buildProject(x, input)).toBe("ad: 8 clips");
    expect(calls[0].cmd).toBe(process.execPath);
    expect(calls[0].args.slice(1)).toEqual(["c.json", "--brand", "b.json", "--proxy", "p.mp4", "--transcript", "t.json", "--out", "o"]);
  });

  it("marks a phrase not found as fixable, for the retry", async () => {
    const { x } = fakeExec(() => ({ code: 1, stderr: 'Error: phrase not found: "grinds" (after 3.2)' }));
    const err = await buildProject(x, input).catch((e) => e);
    expect(err).toBeInstanceOf(BuildError);
    expect(err.fixable).toBe(true);
    expect(err.message).toBe('phrase not found: "grinds" (after 3.2)');
  });

  it("marks anything else as not fixable", async () => {
    const { x } = fakeExec(() => ({ code: 1, stderr: "Error: EBUSY" }));
    const err = await buildProject(x, input).catch((e) => e);
    expect(err.fixable).toBe(false);
  });
});

describe("render", () => {
  it("shrinks a preview after the draft render, and returns the final as is", async () => {
    const { x, calls } = fakeExec();
    expect(await render(x, "proj", "preview", "empty")).toBe(join("proj", "renders", "preview-small.mp4"));
    expect(calls.map((c) => c.cmd)).toEqual(["npx", "ffmpeg"]);
    const f = fakeExec();
    expect(await render(f.x, "proj", "final", "empty")).toBe(join("proj", "renders", "final.mp4"));
    expect(f.calls.map((c) => c.cmd)).toEqual(["npx"]);
  });

  it("runs npx in the folder it is given, with the project as an argument", async () => {
    const { x, calls } = fakeExec();
    await render(x, "proj", "final", "empty");
    expect(calls[0].cwd).toBe("empty");
    expect(calls[0].args).toContain("proj");
  });
});

describe("npxEnv", () => {
  it("drops every npm setting from the environment, and the runner secret", () => {
    const env = npxEnv({
      PATH: "p",
      npm_config_registry: "https://evil",
      NPM_CONFIG_PREFIX: "C:/evil",
      npm_config_userconfig: "C:/evil/.npmrc",
      NPM_CONFIG_CACHE: "C:/evil/cache",
      AGENT_RUNNER_SECRET: "s",
    });
    expect(env).toEqual({ PATH: "p" });
  });
});

describe("transcribe", () => {
  it("moves the CLI's transcript.json into place", async () => {
    const root = mkdtempSync(join(tmpdir(), "tx-"));
    const wav = join(root, "audio", "clip", "clip.wav");
    const out = join(root, "tx", "clip.json");
    const { x, calls } = fakeExec((cmd) => {
      if (cmd === "npx") {
        mkdirSync(join(root, "audio", "clip"), { recursive: true });
        writeFileSync(join(root, "audio", "clip", "transcript.json"), "[]");
      }
      return {};
    });
    await transcribe(x, "p.mp4", wav, out, "empty");
    expect(calls[1].args).toEqual(["--yes", HYPERFRAMES, "transcribe", wav, "--engine", "parakeet", "--json"]);
    const { existsSync } = await import("node:fs");
    expect(existsSync(out)).toBe(true);
  });
});
