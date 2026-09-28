import type { DroppedFile } from "../../functions/lib/creativeNames";

// Read a dropped file's real pixel size in the browser, before anything is
// uploaded, so the checklist can say 1:1 or 4:5 from the pixels themselves.
// A file the browser cannot decode comes back 0x0 and is refused as the wrong
// size, never guessed.

function imageSize(file: File): Promise<{ width: number; height: number }> {
  return createImageBitmap(file).then(
    (bmp) => {
      const size = { width: bmp.width, height: bmp.height };
      bmp.close();
      return size;
    },
    () => ({ width: 0, height: 0 }),
  );
}

function videoSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (width: number, height: number) => {
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
    v.onerror = () => done(0, 0);
    v.src = url;
  });
}

export async function probeFile(id: string, file: File): Promise<DroppedFile> {
  const type = file.type || "";
  const kind = type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : "other";
  const size =
    kind === "image" ? await imageSize(file) : kind === "video" ? await videoSize(file) : { width: 0, height: 0 };
  return { id, fileName: file.name, kind, ...size };
}
