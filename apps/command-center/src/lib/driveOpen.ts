// Where a Drive file opens on Client > Folder (Jake, 2026-10-26: "when I open a
// document I want it to open in the app"). Google's own editor in a frame for
// Docs, Sheets, Slides and Forms, so edits save live; Drive's viewer for
// anything uploaded (photos, video, PDF, Word files). Google types with no
// editor that frames (Sites, shortcuts, My Maps) go out to Google.

const G = "application/vnd.google-apps.";

const EDITORS: Record<string, string> = {
  [`${G}document`]: "document",
  [`${G}spreadsheet`]: "spreadsheets",
  [`${G}presentation`]: "presentation",
  [`${G}form`]: "forms",
  [`${G}drawing`]: "drawings",
};

export type DriveOpen = { kind: "folder" } | { kind: "embed"; url: string } | { kind: "external"; url: string };

export function driveOpen(f: { id: string; mimeType: string; webViewLink: string | null }): DriveOpen {
  if (f.mimeType === `${G}folder`) return { kind: "folder" };
  const editor = EDITORS[f.mimeType];
  if (editor) return { kind: "embed", url: `https://docs.google.com/${editor}/d/${f.id}/edit` };
  if (f.mimeType.startsWith(G)) {
    return { kind: "external", url: f.webViewLink ?? `https://drive.google.com/open?id=${f.id}` };
  }
  return { kind: "embed", url: `https://drive.google.com/file/d/${f.id}/preview` };
}

export type DriveKind = "folder" | "doc" | "sheet" | "slides" | "form" | "pdf" | "image" | "video" | "audio" | "file";

export function driveKind(mimeType: string): DriveKind {
  if (mimeType === `${G}folder`) return "folder";
  if (mimeType === `${G}document`) return "doc";
  if (mimeType === `${G}spreadsheet`) return "sheet";
  if (mimeType === `${G}presentation`) return "slides";
  if (mimeType === `${G}form`) return "form";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}
