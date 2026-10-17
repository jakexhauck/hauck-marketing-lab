// Fakes for the Creative Agent's app calls and the video tools.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CreativeApi } from "../src/creativeApi.ts";
import type { Exec } from "../src/video.ts";
import type { FileCreativeBody, UploadUrlBody } from "../src/wire.ts";

export function fakeCreativeApi() {
  const uploads: UploadUrlBody[] = [];
  const filed: FileCreativeBody[] = [];
  const puts: string[] = [];
  let n = 0;
  const api: CreativeApi = {
    async uploadUrl(b) {
      uploads.push(b);
      n++;
      return { uploadUrl: `https://store/up/${n}`, path: b.preview ? `t-aag/previews/p${n}.mp4` : `t-aag/f${n}.mp4` };
    },
    async readUrl(b) {
      return { url: `https://store/read/${b.path}` };
    },
    async fileCreative(b) {
      filed.push(b);
    },
    async put(url, file) {
      puts.push(`${url} ${file}`);
    },
  };
  return { api, uploads, filed, puts };
}

// Stands in for ffmpeg, npx and build.mjs: writes whatever file the command
// would have written, and can fail the build.
export function fakeExec(buildErrors: string[] = []) {
  const calls: string[] = [];
  const x: Exec = async (cmd, args) => {
    calls.push(`${cmd === process.execPath ? "node" : cmd} ${args[0] === "--yes" ? args[2] : ""}`.trim());
    const write = (f: string, body = "x") => {
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, body);
    };
    if (cmd === process.execPath) {
      const err = buildErrors.shift();
      if (err) return { code: 1, stdout: "", stderr: `Error: ${err}` };
      return { code: 0, stdout: "built", stderr: "" };
    }
    if (cmd === "ffprobe") return { code: 0, stdout: "50.0\n", stderr: "" };
    if (cmd === "npx" && args[2] === "render") write(args[args.indexOf("-o") + 1]);
    else if (cmd === "npx" && args[2] === "transcribe") write(join(dirname(args[3]), "transcript.json"), JSON.stringify([{ text: "Hey,", start: 1, end: 1.4 }]));
    else if (cmd === "ffmpeg") write(args[args.length - 1]);
    return { code: 0, stdout: "", stderr: "" };
  };
  return { x, calls };
}
