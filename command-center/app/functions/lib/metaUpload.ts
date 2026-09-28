import { GRAPH, graphGetAll } from "./metaGraph";
import { parseLabelledName, type CreativeKind, type Ratio } from "./creativeNames";

// Uploads into a client's Meta ad account media library, and the read-back of
// what is there. Shapes proven against the Willis account on 2026-09-28:
//
//   - /adimages takes the file as multipart "filename", and the image's name in
//     the library IS the multipart file name, extension and all. There is no
//     separate name field; the label rides on the file name.
//   - /advideos goes through graph-video.facebook.com in three phases. Meta
//     picks the chunk size: each answer names the next start and end offset.
//   - Deleting a video needs pages_manage_posts, which this app does not hold,
//     so there is deliberately no delete here.
//
// Business Suite folders were the first ask and are not reachable: creating a
// folder needs business_creative_management, which the app cannot be granted.

const GRAPH_VIDEO = GRAPH.replace("graph.facebook.com", "graph-video.facebook.com");

export function normalizeAccount(account: string): string {
  const a = account.trim();
  return a.startsWith("act_") ? a : `act_${a}`;
}

// Meta's own words, not a status code. "Image too small" and "file type not
// supported" are what the operator needs to read on the row that failed.
async function metaPost(url: string, form: FormData): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", body: form });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* non-JSON error page */
  }
  const err = body.error as { message?: string; error_user_msg?: string } | undefined;
  if (!res.ok || err) {
    throw new Error(err?.error_user_msg || err?.message || `Meta ${res.status}: ${text.slice(0, 200)}`);
  }
  return body;
}

export async function uploadAdImage(
  token: string,
  account: string,
  file: Blob,
  name: string,
): Promise<{ hash: string }> {
  const form = new FormData();
  form.set("filename", file, name);
  form.set("access_token", token);
  const body = await metaPost(`${GRAPH}/${normalizeAccount(account)}/adimages`, form);
  const images = (body.images ?? {}) as Record<string, { hash?: string }>;
  const hash = Object.values(images)[0]?.hash;
  if (!hash) throw new Error("Meta accepted the image but returned no hash.");
  return { hash };
}

export interface VideoSession {
  sessionId: string;
  videoId: string;
  start: number;
  end: number;
}

export async function startAdVideo(
  token: string,
  account: string,
  fileSize: number,
): Promise<VideoSession> {
  const form = new FormData();
  form.set("upload_phase", "start");
  form.set("file_size", String(fileSize));
  form.set("access_token", token);
  const b = await metaPost(`${GRAPH_VIDEO}/${normalizeAccount(account)}/advideos`, form);
  return {
    sessionId: String(b.upload_session_id ?? ""),
    videoId: String(b.video_id ?? ""),
    start: Number(b.start_offset ?? 0),
    end: Number(b.end_offset ?? 0),
  };
}

export async function transferAdVideo(
  token: string,
  account: string,
  sessionId: string,
  startOffset: number,
  chunk: Blob,
): Promise<{ start: number; end: number }> {
  const form = new FormData();
  form.set("upload_phase", "transfer");
  form.set("upload_session_id", sessionId);
  form.set("start_offset", String(startOffset));
  form.set("video_file_chunk", chunk, "chunk");
  form.set("access_token", token);
  const b = await metaPost(`${GRAPH_VIDEO}/${normalizeAccount(account)}/advideos`, form);
  return { start: Number(b.start_offset ?? 0), end: Number(b.end_offset ?? 0) };
}

export async function finishAdVideo(
  token: string,
  account: string,
  sessionId: string,
  title: string,
): Promise<void> {
  const form = new FormData();
  form.set("upload_phase", "finish");
  form.set("upload_session_id", sessionId);
  form.set("title", title);
  form.set("access_token", token);
  await metaPost(`${GRAPH_VIDEO}/${normalizeAccount(account)}/advideos`, form);
}

export interface LibraryItem {
  id: string;
  kind: CreativeKind;
  base: string;
  ratio: Ratio;
  name: string;
  thumbnail: string;
  created: string;
  // Videos only: Meta is still encoding it, so it cannot go in an ad yet.
  processing: boolean;
}

// Only labelled items. The account library also holds every still Meta cut from
// a video ad and every image uploaded by hand under a camera-roll name; neither
// is a creative this tab put there, and listing them would bury the ones it did.
export async function listLabelledMedia(token: string, account: string): Promise<LibraryItem[]> {
  const acct = normalizeAccount(account);
  const [images, videos] = await Promise.all([
    graphGetAll(token, `/${acct}/adimages`, {
      fields: "hash,name,url_128,url,created_time",
      limit: "500",
    }),
    graphGetAll(token, `/${acct}/advideos`, {
      fields: "id,title,picture,created_time,status",
      limit: "200",
    }),
  ]);

  const items: LibraryItem[] = [];
  for (const im of images) {
    const name = String(im.name ?? "");
    const parsed = parseLabelledName(name);
    if (!parsed) continue;
    items.push({
      id: String(im.hash ?? ""),
      kind: "image",
      ...parsed,
      name,
      thumbnail: String(im.url_128 ?? im.url ?? ""),
      created: String(im.created_time ?? ""),
      processing: false,
    });
  }
  for (const v of videos) {
    const name = String(v.title ?? "");
    const parsed = parseLabelledName(name);
    if (!parsed) continue;
    const status = (v.status ?? {}) as { video_status?: string };
    items.push({
      id: String(v.id ?? ""),
      kind: "video",
      ...parsed,
      name,
      thumbnail: String(v.picture ?? ""),
      created: String(v.created_time ?? ""),
      processing: status.video_status === "processing",
    });
  }
  return items.sort((a, b) => b.created.localeCompare(a.created));
}
