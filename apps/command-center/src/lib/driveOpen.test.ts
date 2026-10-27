import { describe, expect, it } from "vitest";
import { asGoogleAccount, driveKind, driveOpen } from "./driveOpen";

describe("asGoogleAccount", () => {
  it("opens the doc as the given Google account", () => {
    expect(asGoogleAccount("https://docs.google.com/document/d/abc/edit", "contact.jakehauck@gmail.com")).toBe(
      "https://docs.google.com/document/d/abc/edit?authuser=contact.jakehauck%40gmail.com",
    );
  });

  it("keeps a link's own query and replaces an old account", () => {
    expect(asGoogleAccount("https://drive.google.com/open?id=abc&authuser=0", "a@b.co")).toBe(
      "https://drive.google.com/open?id=abc&authuser=a%40b.co",
    );
  });

  it("leaves the link alone with no account", () => {
    expect(asGoogleAccount("https://docs.google.com/document/d/abc/edit", null)).toBe("https://docs.google.com/document/d/abc/edit");
    expect(asGoogleAccount("https://docs.google.com/document/d/abc/edit", "  ")).toBe("https://docs.google.com/document/d/abc/edit");
  });
});

const f = (mimeType: string, webViewLink: string | null = null) => ({ id: "abc", mimeType, webViewLink });

describe("driveOpen", () => {
  it("opens a folder in the list", () => {
    expect(driveOpen(f("application/vnd.google-apps.folder"))).toEqual({ kind: "folder" });
  });

  it("opens Docs, Sheets, Slides and Forms in Google's editor", () => {
    expect(driveOpen(f("application/vnd.google-apps.document"))).toEqual({
      kind: "embed",
      url: "https://docs.google.com/document/d/abc/edit",
    });
    expect(driveOpen(f("application/vnd.google-apps.spreadsheet"))).toEqual({
      kind: "embed",
      url: "https://docs.google.com/spreadsheets/d/abc/edit",
    });
    expect(driveOpen(f("application/vnd.google-apps.presentation"))).toEqual({
      kind: "embed",
      url: "https://docs.google.com/presentation/d/abc/edit",
    });
    expect(driveOpen(f("application/vnd.google-apps.form"))).toEqual({
      kind: "embed",
      url: "https://docs.google.com/forms/d/abc/edit",
    });
  });

  it("opens uploaded files in Drive's viewer", () => {
    for (const mime of ["image/png", "video/mp4", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) {
      expect(driveOpen(f(mime))).toEqual({ kind: "embed", url: "https://drive.google.com/file/d/abc/preview" });
    }
  });

  it("opens every kind as the signed-in admin's Google account", () => {
    expect(driveOpen(f("application/vnd.google-apps.document"), "a@b.co")).toEqual({
      kind: "embed",
      url: "https://docs.google.com/document/d/abc/edit?authuser=a%40b.co",
    });
    expect(driveOpen(f("image/png"), "a@b.co")).toEqual({
      kind: "embed",
      url: "https://drive.google.com/file/d/abc/preview?authuser=a%40b.co",
    });
  });

  it("sends Google types with no in-page editor out to Google", () => {
    expect(driveOpen(f("application/vnd.google-apps.shortcut", "https://drive.google.com/x"))).toEqual({
      kind: "external",
      url: "https://drive.google.com/x",
    });
    expect(driveOpen(f("application/vnd.google-apps.site"))).toEqual({
      kind: "external",
      url: "https://drive.google.com/open?id=abc",
    });
  });
});

describe("driveKind", () => {
  it("names the common types", () => {
    expect(driveKind("application/vnd.google-apps.folder")).toBe("folder");
    expect(driveKind("application/vnd.google-apps.document")).toBe("doc");
    expect(driveKind("application/vnd.google-apps.spreadsheet")).toBe("sheet");
    expect(driveKind("application/vnd.google-apps.presentation")).toBe("slides");
    expect(driveKind("application/pdf")).toBe("pdf");
    expect(driveKind("image/heic")).toBe("image");
    expect(driveKind("video/quicktime")).toBe("video");
    expect(driveKind("audio/mpeg")).toBe("audio");
    expect(driveKind("application/zip")).toBe("file");
  });
});
