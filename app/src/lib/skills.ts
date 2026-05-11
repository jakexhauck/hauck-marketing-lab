import type { SkillFile, SkillInput } from "./types";

export type { SkillFile, SkillInput };

/**
 * SKILL.md `inputs:` schema (optional YAML list in frontmatter):
 *   inputs:
 *     - name: angles           # required, used as the value key
 *       label: Number of angles  # optional, defaults to `name`
 *       prompt: How many angles? # optional, shown in the form
 *       default: "4"           # optional, prefilled value
 */

export type SkillChip = {
  label: string;
  category: string;
  skillId: string;
  featured?: boolean;
};

export function defaultSkillChips(): SkillChip[] {
  return [
    { label: "Diagnose campaign", category: "diagnostic", skillId: "metric-diagnosis", featured: true },
    { label: "Generate hooks", category: "generative", skillId: "hook-generator" },
    { label: "Tracking audit", category: "diagnostic", skillId: "tracking-audit" },
    { label: "Scale readiness", category: "strategic", skillId: "scale-readiness-check" },
    { label: "Creative brief", category: "generative", skillId: "creative-brief" },
    { label: "Audience expansion", category: "optimization", skillId: "audience-expansion" },
  ];
}

const REFERENCE_CAP = 1500;

function trimReference(body: string): string {
  const clean = body.trim();
  if (clean.length <= REFERENCE_CAP) return clean;
  return clean.slice(0, REFERENCE_CAP).trimEnd() + "\n…";
}

function inputLabel(i: SkillInput): string {
  return i.label?.trim() || i.name;
}

export function assembleSkillPrompt(
  skill: SkillFile,
  values: Record<string, string>,
  clientName: string,
): string {
  const lines: string[] = [];
  lines.push(`Run the ${skill.name} skill for ${clientName}.`);
  if (skill.description) {
    lines.push("");
    lines.push(`Skill brief: ${skill.description}`);
  }

  if (skill.inputs.length > 0) {
    lines.push("");
    lines.push("Inputs:");
    for (const input of skill.inputs) {
      const raw = values[input.name];
      const value = (raw ?? input.default ?? "").trim();
      lines.push(`- ${inputLabel(input)}: ${value || "(not provided)"}`);
    }
  }

  const reference = trimReference(skill.body);
  if (reference.length > 0) {
    lines.push("");
    lines.push("Reference (from SKILL.md):");
    lines.push(reference);
  }

  lines.push("");
  lines.push("Follow the skill's defined output format. Be concise and decision-ready.");
  return lines.join("\n");
}
