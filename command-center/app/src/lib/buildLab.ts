// Build Lab: a tiny, backend-free idea board for the admin console. Jake
// captures a feature idea, a guided composer assembles a clean Claude Code
// prompt from it, and the card tracks idea -> building -> shipped. Everything
// lives in localStorage on this machine; there is deliberately no API. Keeping
// it local is the whole point: it is a personal build cockpit, not shared data.

export type BuildStatus = "idea" | "building" | "shipped";

// The kind of work this card is. Drives which Build Rules preset (Spine +
// Modules) gets baked into the generated prompt. See PROJECT_TYPES below.
export type ProjectType =
  | "web-feature"
  | "backend"
  | "landing"
  | "static"
  | "bugfix"
  | "new-project";

export interface BuildCard {
  id: string;
  title: string;
  // Composer inputs, kept so the prompt can be rebuilt/edited later.
  projectType: ProjectType; // selects the Build Rules preset
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
  projectType: ProjectType;
  area: string;
  want: string;
  details: string;
}): BuildCard {
  return {
    id: uid(),
    title: input.title.trim(),
    projectType: input.projectType,
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

// The conditional Modules from the Hauck Build Rules (CLAUDE.md). Each maps to
// the skills that fire when it switches on. Presets below reference these by
// code; a `when` makes the module conditional (only fires if the IF is true).
const MODULE_TEXT: Record<string, string> = {
  M1: "M1 Research (deep-research; claude-api if Claude is involved)",
  M2: "M2 Audit the existing code first (impeccable audit-first for UI; read existing for non-UI)",
  M3: "M3 Design direction (ui-ux-pro-max; thellc-design for the internal portal; taste-skill for landing pages)",
  M4: "M4 Mockups: build 2-3 options for me to pick (ui-ux-pro-max + impeccable)",
  M5: "M5 Isolation (using-git-worktrees; dispatching-parallel-agents if it splits)",
  M6: "M6 Motion (emil-design-eng; review-animations gate)",
  M7: "M7 Infra (trigger-dev for jobs/cron; composio for SaaS; rust-analyzer-lsp for Rust; claude-api for Claude wiring)",
  M8: "M8 Security (security-review)",
  M9: "M9 Visual proof: Playwright screenshots of the running app",
};

interface ModuleRef {
  code: keyof typeof MODULE_TEXT;
  when?: string; // present = conditional; absent = always on for this preset
}

interface ProjectTypeDef {
  key: ProjectType;
  label: string;
  spine: string; // how the always-on Spine runs for this type
  modules: ModuleRef[];
  note?: string; // any extra preset-specific guidance
}

const FULL_SPINE =
  "Run the full Spine: Frame (brainstorming), Plan (writing-plans), Build (test-driven-development), Debug (systematic-debugging) on any failure, Review (code-review + simplify), Verify (verification-before-completion + run, show evidence), Ship (finishing-a-development-branch), Capture (writing-skills if repeatable).";

export const PROJECT_TYPES: ProjectTypeDef[] = [
  {
    key: "web-feature",
    label: "Web app feature",
    spine: FULL_SPINE,
    modules: [
      { code: "M3", when: "the change has a UI" },
      { code: "M4", when: "it is new UI or a visual overhaul" },
      { code: "M5" },
      { code: "M6", when: "there is animation or interaction" },
      { code: "M7", when: "it needs jobs/cron, external SaaS, or Claude wiring" },
      { code: "M8", when: "it touches auth, secrets, Supabase, or payments" },
      { code: "M9", when: "the change has a UI" },
    ],
  },
  {
    key: "backend",
    label: "Backend / script",
    spine: FULL_SPINE,
    modules: [
      { code: "M1", when: "there is an unknown API or library" },
      { code: "M5" },
      { code: "M7", when: "it needs jobs/cron or external SaaS" },
      { code: "M8", when: "it touches secrets, auth, or Supabase" },
    ],
    note: "No design, mockups, motion, or visual-proof modules: this work has no UI.",
  },
  {
    key: "landing",
    label: "Client landing page",
    spine: FULL_SPINE,
    modules: [
      { code: "M3" },
      { code: "M4" },
      { code: "M6", when: "there is animation or interaction" },
      { code: "M9" },
    ],
    note: "Use taste-skill for the design. No infra or security modules.",
  },
  {
    key: "static",
    label: "Static / content",
    spine:
      "Run the Spine, minimal: Frame (brainstorming), Build, Verify (show it), Ship (finishing-a-development-branch). Skip heavy planning and review.",
    modules: [],
  },
  {
    key: "bugfix",
    label: "Bugfix",
    spine:
      "Fast path: Frame, then systematic-debugging to root cause (no guess-and-patch), fix, Verify with evidence, Ship.",
    modules: [
      { code: "M5", when: "the fix spans multiple files or is risky" },
      { code: "M8", when: "it touches auth, secrets, or payments" },
    ],
  },
  {
    key: "new-project",
    label: "New project",
    spine: FULL_SPINE,
    modules: [
      { code: "M1", when: "there is an unknown API or library" },
      { code: "M3", when: "it has a UI" },
      { code: "M4", when: "it has a UI" },
      { code: "M5" },
      { code: "M7", when: "it needs jobs/cron, external SaaS, or Claude wiring" },
      { code: "M8", when: "it handles auth, secrets, or payments" },
      { code: "M9", when: "it has a UI" },
    ],
    note: "Greenfield: initialise the repo, run /init to create a CLAUDE.md, and use skill-creator if a repeatable process emerges.",
  },
];

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> =
  PROJECT_TYPES.reduce(
    (acc, t) => {
      acc[t.key] = t.label;
      return acc;
    },
    {} as Record<ProjectType, string>,
  );

export const DEFAULT_PROJECT_TYPE: ProjectType = "web-feature";

function projectTypeDef(type: ProjectType | undefined): ProjectTypeDef {
  return (
    PROJECT_TYPES.find((t) => t.key === type) ??
    PROJECT_TYPES.find((t) => t.key === DEFAULT_PROJECT_TYPE)!
  );
}

// Assemble a ready-to-paste Claude Code prompt from the composer fields. The
// house rules and the Hauck Build Rules preset (Spine + the Modules that match
// this project type) are baked in, so every prompt drives the same process and
// Jake never has to remember which skills to pull. Empty sections are dropped.
export function buildPrompt(card: {
  title: string;
  projectType?: ProjectType;
  area: string;
  want: string;
  details: string;
}): string {
  const def = projectTypeDef(card.projectType);
  const lines: string[] = [];

  lines.push(`# ${card.title || "Untitled build"}`);
  lines.push("");

  lines.push(`**Project type:** ${def.label}`);
  if (card.area) {
    lines.push(`**Area:** ${card.area}`);
  }
  lines.push("");

  lines.push("**What I want:**");
  lines.push(card.want || "(describe the change)");
  lines.push("");

  if (card.details) {
    lines.push("**Details / constraints:**");
    lines.push(card.details);
    lines.push("");
  }

  // The Build Rules preset. Announce each skill as it fires.
  lines.push("**Build process (Hauck Build Rules):**");
  lines.push(`- ${def.spine}`);
  if (def.modules.length > 0) {
    lines.push("- Modules to apply:");
    for (const m of def.modules) {
      const text = MODULE_TEXT[m.code];
      lines.push(`  - ${text}${m.when ? ` (only if ${m.when})` : ""}`);
    }
  } else {
    lines.push("- No extra modules: the minimal Spine is enough here.");
  }
  if (def.note) lines.push(`- ${def.note}`);
  lines.push("- Announce each skill as it fires (\"Using brainstorming to...\").");
  lines.push("");

  lines.push("**House rules:**");
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
    "- Verify before claiming done: build/typecheck, run it, then tell me plainly what changed and how to see it. No \"should work\".",
  );

  return lines.join("\n");
}
