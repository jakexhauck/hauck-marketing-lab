import { useEffect } from "react";

// Point "Add to Home Screen" at THIS page rather than at the app root.
//
// The app ships one manifest (VitePWA, vite.config.ts) and its start_url is
// "/". iOS reads the manifest of whichever page you are standing on when you
// add the icon, and start_url wins over that page's URL: adding from
// /admin/setter still produced an icon that opened the whole Command Center.
//
// So a page that is worth its own icon swaps in its own manifest while it is
// open, plus the apple- title iOS suggests as the icon's name. Both are put
// back on unmount, so every other page still installs as the Command Center.
export function useHomeScreenTarget(manifestHref: string, appName: string) {
  useEffect(() => {
    const head = document.head;

    // The manifest link is injected into index.html at build time, so in a dev
    // server it can be absent. Either way the page ends up with exactly one.
    const existingLink = head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const link = existingLink ?? document.createElement("link");
    const previousHref = existingLink?.getAttribute("href") ?? null;
    link.rel = "manifest";
    link.setAttribute("href", manifestHref);
    if (!existingLink) head.appendChild(link);

    const existingTitle = head.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]',
    );
    const meta = existingTitle ?? document.createElement("meta");
    const previousTitle = existingTitle?.getAttribute("content") ?? null;
    meta.name = "apple-mobile-web-app-title";
    meta.setAttribute("content", appName);
    if (!existingTitle) head.appendChild(meta);

    return () => {
      if (previousHref === null) link.remove();
      else link.setAttribute("href", previousHref);
      if (previousTitle === null) meta.remove();
      else meta.setAttribute("content", previousTitle);
    };
  }, [manifestHref, appName]);
}

export default useHomeScreenTarget;
