import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export interface OpenInAppOptions {
  width?: number;
  height?: number;
  background?: string;
}

export async function openInAppWindow(
  url: string,
  title: string,
  opts: OpenInAppOptions = {},
): Promise<void> {
  const label = `popup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const { width = 1280, height = 820, background = "#0a0a0a" } = opts;
  try {
    const win = new WebviewWindow(label, {
      url,
      title: title || "Hauck Marketing Lab",
      width,
      height,
      minWidth: 720,
      minHeight: 480,
      resizable: true,
      backgroundColor: background,
    });
    win.once("tauri://error", (e) => {
      console.error("openInAppWindow failed:", e);
      window.open(url, "_blank", "noopener,noreferrer");
    });
  } catch (err) {
    console.error("openInAppWindow threw:", err);
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
