import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";

// Google Drive REST helpers for the internal "Assets" hub. The portal acts as a
// single agency Google account whose refresh token lives in drive_connection.
// Ported from the desktop app's app/src-tauri/src/drive_api.rs (same endpoints
// and field selections), adapted to fetch + the Workers runtime.

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Full Drive scope: the agency account owns all client files, so the portal
// needs to browse and write existing folders (drive.file only sees app-created
// files). Permission for WHO sees what is enforced in our own tables, not Drive.
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  size?: string;
}

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export function isFolder(f: DriveFile): boolean {
  return f.mimeType === FOLDER_MIME;
}

// Drive file ids and folder ids are URL-safe: alphanumerics, '-', '_'.
export function isValidFileId(id: string): boolean {
  return id.length > 0 && /^[A-Za-z0-9_-]+$/.test(id);
}

// Pull a bare folder id out of a Drive share URL, or pass a bare id through.
export function extractFolderId(input: string): string | null {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;
  const afterFolders = trimmed.split("/folders/")[1];
  if (afterFolders) {
    const id = afterFolders.match(/^[A-Za-z0-9_-]+/)?.[0] ?? "";
    if (isValidFileId(id)) return id;
  }
  // ?id=<id> style links.
  const idParam = trimmed.match(/[?&]id=([A-Za-z0-9_-]+)/)?.[1];
  if (idParam && isValidFileId(idParam)) return idParam;
  if (isValidFileId(trimmed)) return trimmed;
  return null;
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

interface DriveConnectionRow {
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
}

/**
 * Return a valid access token for the connected agency account, refreshing it
 * via the stored refresh_token when the cached one is missing or near expiry.
 * Throws a friendly Error if Google is not connected yet.
 */
export async function getDriveAccessToken(env: Env, supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("drive_connection")
    .select("refresh_token, access_token, access_token_expires_at")
    .eq("id", true)
    .maybeSingle();
  const row = data as DriveConnectionRow | null;
  if (!row?.refresh_token) {
    throw new DriveNotConnectedError();
  }

  // Reuse the cached access token if it has >60s of life left.
  const exp = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0;
  if (row.access_token && Number.isFinite(exp) && exp - Date.now() > 60_000) {
    return row.access_token;
  }

  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured (missing client id/secret).");
  }

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    // invalid_grant means the refresh token was revoked → force a reconnect.
    if (text.includes("invalid_grant")) {
      throw new DriveNotConnectedError("Google access was revoked. Reconnect the agency account.");
    }
    throw new Error(`Google token refresh failed (${resp.status}): ${text}`);
  }
  const parsed = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!parsed.access_token) {
    throw new Error(`Google token refresh returned no access_token: ${text}`);
  }
  const expiresAt = new Date(Date.now() + (parsed.expires_in ?? 3600) * 1000).toISOString();

  await supabase
    .from("drive_connection")
    .update({ access_token: parsed.access_token, access_token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("id", true);

  return parsed.access_token;
}

export class DriveNotConnectedError extends Error {
  constructor(message = "Google Drive is not connected yet.") {
    super(message);
    this.name = "DriveNotConnectedError";
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

const LIST_FIELDS =
  "nextPageToken,files(id,name,mimeType,webViewLink,iconLink,thumbnailLink,modifiedTime,size)";

/** List the immediate children (folders + files) of a Drive folder, sorted folders-first then by name. */
export async function listFolderChildren(token: string, folderId: string): Promise<DriveFile[]> {
  if (!isValidFileId(folderId)) throw new Error(`invalid folder id: ${folderId}`);
  const q = `'${folderId}' in parents and trashed = false`;
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      fields: LIST_FIELDS,
      orderBy: "folder,name",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const resp = await fetch(`${DRIVE_FILES}?${params}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await resp.text();
    if (!resp.ok) throw driveError("list", resp.status, body);
    const parsed = JSON.parse(body) as { files?: DriveFile[]; nextPageToken?: string };
    if (parsed.files) all.push(...parsed.files);
    pageToken = parsed.nextPageToken;
  } while (pageToken);
  return all;
}

/** Fetch metadata for one file (default fields cover access checks + display). */
export async function getFileMeta(
  token: string,
  fileId: string,
  fields = "id,name,mimeType,parents,webViewLink,size",
): Promise<(DriveFile & { parents?: string[] }) | null> {
  if (!isValidFileId(fileId)) throw new Error(`invalid file id: ${fileId}`);
  const params = new URLSearchParams({ fields, supportsAllDrives: "true" });
  const resp = await fetch(`${DRIVE_FILES}/${fileId}?${params}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (resp.status === 404) return null;
  const body = await resp.text();
  if (!resp.ok) throw driveError("get", resp.status, body);
  return JSON.parse(body);
}

/**
 * Proxy a file's bytes back to the caller. Native Google docs/sheets/slides are
 * exported to a portable format (PDF / xlsx / pptx); everything else streams
 * as-is. Returns the upstream Response so the caller can pass through headers.
 */
export async function downloadFile(token: string, fileId: string, mimeType: string): Promise<Response> {
  if (!isValidFileId(fileId)) throw new Error(`invalid file id: ${fileId}`);
  const exportMime = GOOGLE_EXPORT_MIME[mimeType];
  const url = exportMime
    ? `${DRIVE_FILES}/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`
    : `${DRIVE_FILES}/${fileId}?alt=media&supportsAllDrives=true`;
  const resp = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const body = await resp.text();
    throw driveError("download", resp.status, body);
  }
  return resp;
}

// Native Google formats can't be downloaded raw; map each to a portable export.
const GOOGLE_EXPORT_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": "application/pdf",
  "application/vnd.google-apps.spreadsheet":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.google-apps.presentation":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.google-apps.drawing": "image/png",
};

export function exportExtension(mimeType: string): string | null {
  switch (GOOGLE_EXPORT_MIME[mimeType]) {
    case "application/pdf":
      return "pdf";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "pptx";
    case "image/png":
      return "png";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB ceiling for a portal upload.

/** Multipart-upload a byte buffer into a folder as a native (un-converted) file. */
export async function uploadFile(
  token: string,
  parentFolderId: string,
  filename: string,
  mimeType: string,
  bytes: ArrayBuffer | Uint8Array,
): Promise<DriveFile> {
  if (!isValidFileId(parentFolderId)) throw new Error(`invalid parent folder id: ${parentFolderId}`);
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.byteLength === 0) throw new Error("refusing to upload an empty file");
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`file too large (${data.byteLength} bytes; max ${MAX_UPLOAD_BYTES})`);
  }
  const safeMime = mimeType && /^[\w.+-]+\/[\w.+-]+$/.test(mimeType) ? mimeType : "application/octet-stream";
  const metadata = JSON.stringify({ name: sanitizeName(filename), parents: [parentFolderId] });

  const boundary = `hml_${crypto.randomUUID().replace(/-/g, "")}`;
  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${safeMime}\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(pre.byteLength + data.byteLength + post.byteLength);
  body.set(pre, 0);
  body.set(data, pre.byteLength);
  body.set(post, pre.byteLength + data.byteLength);

  const resp = await fetch(
    `${DRIVE_UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,iconLink,modifiedTime,size`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const text = await resp.text();
  if (!resp.ok) throw driveError("upload", resp.status, text);
  return JSON.parse(text) as DriveFile;
}

/** Create a subfolder inside a parent folder. */
export async function createFolder(token: string, parentFolderId: string, name: string): Promise<DriveFile> {
  if (!isValidFileId(parentFolderId)) throw new Error(`invalid parent folder id: ${parentFolderId}`);
  const resp = await fetch(`${DRIVE_FILES}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,modifiedTime`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: sanitizeName(name), mimeType: FOLDER_MIME, parents: [parentFolderId] }),
  });
  const text = await resp.text();
  if (!resp.ok) throw driveError("create folder", resp.status, text);
  return JSON.parse(text) as DriveFile;
}

/** Trash a file/folder. Idempotent: a 404 is treated as already gone. */
export async function deleteFile(token: string, fileId: string): Promise<{ alreadyGone: boolean }> {
  if (!isValidFileId(fileId)) throw new Error(`invalid file id: ${fileId}`);
  // Trash rather than hard-delete, so a mistaken click is recoverable from Drive.
  const resp = await fetch(`${DRIVE_FILES}/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  if (resp.status === 404) return { alreadyGone: true };
  if (!resp.ok) throw driveError("delete", resp.status, await resp.text());
  return { alreadyGone: false };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeName(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) return "Untitled";
  const cleaned = trimmed.replace(/[/\\:*?"<>|]/g, "-");
  return cleaned.length > 180 ? cleaned.slice(0, 180) : cleaned;
}

function driveError(op: string, status: number, body: string): Error {
  if (status === 401) {
    return new DriveNotConnectedError("Google access expired. Reconnect the agency account in Assets.");
  }
  if (status === 403) {
    return new Error(`Drive denied the ${op} (403). Check the agency account has access to this folder. ${body}`);
  }
  if (status === 404) {
    return new Error(`Drive ${op}: not found (404).`);
  }
  return new Error(`Drive ${op} failed (${status}): ${body}`);
}
