// The Creative Agent's three app calls (Phase 3), beside the shared RunnerApi
// rather than inside it so each lane's additions stay in its own file. Same
// header, same base, same secret as src/api.ts.
//
// The bytes go straight from this PC to Supabase storage on a signed URL;
// the app only signs, checks and files.

import { readFileSync, statSync } from "node:fs";
import type { ApiOptions } from "./api.ts";
import type { FileCreativeBody, ReadUrlBody, ReadUrlResponse, UploadUrlBody, UploadUrlResponse } from "./wire.ts";

export interface CreativeApi {
  uploadUrl(body: UploadUrlBody): Promise<UploadUrlResponse>;
  readUrl(body: ReadUrlBody): Promise<ReadUrlResponse>;
  fileCreative(body: FileCreativeBody): Promise<void>;
  // PUT a local file to a signed upload URL.
  put(uploadUrl: string, file: string, type: string): Promise<void>;
}

export function createCreativeApi(opts: ApiOptions): CreativeApi {
  const base = opts.base.replace(/\/+$/, "");
  const f = opts.fetch ?? fetch;
  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await f(`${base}/api/agent-runner/${path}`, {
      method: "POST",
      headers: { "x-agent-runner-secret": opts.secret, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${text.slice(0, 300)}`);
    return (text.trim() ? JSON.parse(text) : null) as T;
  }
  return {
    uploadUrl: (b) => post<UploadUrlResponse>("upload-url", b),
    readUrl: (b) => post<ReadUrlResponse>("read-url", b),
    fileCreative: async (b) => void (await post("file-creative", b)),
    async put(uploadUrl, file, type) {
      const bytes = readFileSync(file);
      const res = await f(uploadUrl, {
        method: "PUT",
        headers: { "content-type": type, "content-length": String(statSync(file).size) },
        body: bytes,
        signal: AbortSignal.timeout(10 * 60_000),
      });
      if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 300)}`);
    },
  };
}
