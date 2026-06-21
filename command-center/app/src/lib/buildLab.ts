// Build Lab: a tiny, backend-free idea board for the admin console. Jake
// captures a feature idea, a guided composer assembles a clean Claude Code
// prompt from it, and the card tracks idea -> building -> shipped. Everything
// lives in localStorage on this machine; there is deliberately no API. Keeping
// it local is the whole point: it is a personal build cockpit, not shared data.

export type BuildStatus = "idea" | "building" | "shipped";

export interface BuildCard {
  id: string;
  title: string;
  // Composer inputs, kept so the prompt can be rebuilt/edited later.
  area: string; // which page/component/feature it touches
  want: string; // what it should do
  details: string; // constraints, edge cases, "don't touch X"
  status: BuildStatus;
  createdAt: number;
  shippedAt: number | null;
}

const KEY = "hml.buildLab.cards.v1";

// crypto.randomUUID is available in every browser this app runs in.
function uid(): string {
  return crypto.randomUUID();
}

export function loadCards(): BuildCard[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BuildCard[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCards(cards: BuildCard[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cards));
  } catch {
    // A full/blocked storage just means this session is not persisted. The
    // board still works in memory; nothing to surface to the user.
  }
}

export function newCard(input: {
  title: string;
  area: string;
  want: string;
  details: string;
}): BuildCard {
  return {
    id: uid(),
    title: input.title.trim(),
    area: input.area.trim(),
    want: input.want.trim(),
    details: input.details.trim(),
    status: "idea",
    createdAt: Date.now(),
    shippedAt: null,
  };
}

export const STATUS_ORDER: BuildStatus[] = ["idea", "building", "shipped"];

export const STATUS_LABEL: Record<BuildStatus, string> = {
  idea: "Ideas",
  building: "Building",
  shipped: "Shipped",
};

// The areas Jake builds in most. Free text is always allowed in the composer;
// these are just quick-pick suggestions so he does not retype the obvious ones.
export const AREA_SUGGESTIONS: string[] = [
  "Client app (Leads / pipeline)",
  "Client app (Dashboard)",
  "Client app (Paid Ads)",
  "Client app (Calendar)",
  "Client app (Settings / Team)",
  "Admin console (Clients)",
  "Admin console (Tasks)",
  "Admin console (SOP Hub)",
  "Backend / API (command-center)",
  "Database / migration",
  "Design / styling pass",
];

// Assemble a ready-to-paste Claude Code prompt from the composer fields. The
// house rules (address, no em dashes, match existing patterns, verify) are
// baked in so every prompt starts from the same high standard and Jake never
// has to remember them. Empty sections are dropped.
export function buildPrompt(card: {
  title: string;
  area: string;
  want: string;
  details: string;
}): string {
  const lines: string[] = [];

  lines.push(`# ${card.title || "Untitled build"}`);
  lines.push("");

  if (card.area) {
    lines.push(`**Area:** ${card.area}`);
    lines.push("");
  }

  lines.push("**What I want:**");
  lines.push(card.want || "(describe the change)");
  lines.push("");

  if (card.details) {
    lines.push("**Details / constraints:**");
    lines.push(card.details);
    lines.push("");
  }

  lines.push("**How to work:**");
  lines.push(
    "- Read the surrounding files first and match the existing patterns, components, and styling tokens. Do not invent new conventions.",
  );
  lines.push(
    "- Keep it focused on the above. Do not refactor or touch unrelated code.",
  );
  lines.push(
    "- No em dashes anywhere in code, comments, or UI text. Use commas, periods, or colons.",
  );
  lines.push(
    "- When done, build/typecheck to confirm it compiles, then tell me plainly what changed and how to see it.",
  );

  return lines.join("\n");
}
