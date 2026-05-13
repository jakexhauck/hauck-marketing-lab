/**
 * Stroke-based SVG icon set used throughout the v2 design.
 *
 * Each icon is a small functional component that takes the standard
 * `size`/`className` props and inherits `currentColor` so callers control
 * colour via CSS. The styling matches the mockups under
 * `mockups/restructure/`.
 */

import type { SVGProps } from "react";

interface IconProps
  extends Omit<SVGProps<SVGSVGElement>, "stroke" | "fill" | "strokeWidth"> {
  size?: number;
}

function I({
  size = 15,
  strokeWidth = 1.6,
  children,
  ...rest
}: IconProps & { strokeWidth?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

// ──────── Workspace ────────

export function IconDashboard(p: IconProps) {
  return (
    <I {...p}>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </I>
  );
}

export function IconCalendar(p: IconProps) {
  return (
    <I {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </I>
  );
}

export function IconTasks(p: IconProps) {
  return (
    <I {...p}>
      <path d="M9 11l3 3l8 -8" />
      <path d="M21 12v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h11" />
    </I>
  );
}

export function IconRecordings(p: IconProps) {
  return (
    <I {...p}>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </I>
  );
}

export function IconSOPs(p: IconProps) {
  return (
    <I {...p}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </I>
  );
}

// ──────── Outreach ────────

export function IconBroadcast(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48 0a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </I>
  );
}

export function IconTarget(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </I>
  );
}

export function IconLayout(p: IconProps) {
  return (
    <I {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </I>
  );
}

// ──────── Client sections ────────

export function IconUser(p: IconProps) {
  return (
    <I {...p}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </I>
  );
}

export function IconPen(p: IconProps) {
  return (
    <I {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </I>
  );
}

export function IconFolder(p: IconProps) {
  return (
    <I {...p}>
      <path d="M3 7v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-3H5a2 2 0 0 0-2 2z" />
    </I>
  );
}

export function IconBarChart(p: IconProps) {
  return (
    <I {...p}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </I>
  );
}

export function IconGlobe(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15 15 0 0 1 4 10a15 15 0 0 1-4 10a15 15 0 0 1-4-10a15 15 0 0 1 4-10z" />
    </I>
  );
}

// ──────── UI ────────

export function IconChevronRight(p: IconProps) {
  return (
    <I {...p} strokeWidth={2}>
      <polyline points="9 18 15 12 9 6" />
    </I>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <I {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </I>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </I>
  );
}

export function IconBell(p: IconProps) {
  return (
    <I {...p}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </I>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83a2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2a2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0a2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2a2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83a2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2a2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0a2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2a2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </I>
  );
}

export function IconArrowRight(p: IconProps) {
  return (
    <I {...p} strokeWidth={2}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </I>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <I {...p} strokeWidth={1.7}>
      <polyline points="20 6 9 17 4 12" />
    </I>
  );
}

export function IconMessage(p: IconProps) {
  return (
    <I {...p}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </I>
  );
}

export function IconMail(p: IconProps) {
  return (
    <I {...p}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </I>
  );
}

export function IconSend(p: IconProps) {
  return (
    <I {...p}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </I>
  );
}

export function IconList(p: IconProps) {
  return (
    <I {...p}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </I>
  );
}

export function IconClock(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </I>
  );
}

export function IconFile(p: IconProps) {
  return (
    <I {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </I>
  );
}

export function IconStar(p: IconProps) {
  return (
    <I {...p}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </I>
  );
}

export function IconBolt(p: IconProps) {
  return (
    <I {...p} strokeWidth={1.7}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </I>
  );
}

export function IconUsers(p: IconProps) {
  return (
    <I {...p}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </I>
  );
}

export function IconMore(p: IconProps) {
  return (
    <I {...p}>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </I>
  );
}

export function IconFilter(p: IconProps) {
  return (
    <I {...p} strokeWidth={1.7}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </I>
  );
}

export function IconLightning(p: IconProps) {
  return (
    <I {...p}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </I>
  );
}
