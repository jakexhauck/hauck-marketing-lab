// Builds each Grok bot's upload folder from the vault and the agent prompts, so the bots
// never drift from the source of truth. Run from anywhere: `node agency/grok-bots/build.mjs`.
// Output: agency/grok-bots/<bot>/upload/ (git-ignored, rebuilt from scratch every run).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

// Per bot: upload name -> repo path. Each bot also gets Clients.md and its own knowledge/ folder.
const bots = {
  creative: {
    "ogilvy.md": "projects/agent-runner/agents/copy/ogilvy.md",
    "copywriting.md": "projects/agent-runner/agents/copy/copywriting.md",
    "copy-frameworks.md": "projects/agent-runner/agents/copy/copy-frameworks.md",
    "copy-editing.md": "projects/agent-runner/agents/copy/copy-editing.md",
    "stop-slop.md": "projects/agent-runner/agents/copy/stop-slop.md",
    "broll-prompts.md": ".claude/skills/ai-broll-ad/reference/prompts.md",
  },
};

// House rule: no em dashes reach Grok, plus vault-only noise (lesson ids, chat ids, comments).
// The dashes are built from char codes so this file holds none itself.
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const clean = (text) =>
  text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(new RegExp(`^(#+ .*?)\\s*${EM}\\s*`, "gm"), "$1: ")
    .replace(new RegExp(`\\s*${EM}\\s*`, "g"), ", ")
    .replaceAll(EN, "-")
    .replace(/ \^l-[0-9a-f]+/g, "")
    .replace(/, chat [0-9a-f]+\)/g, ")")
    .replace(/\n{3,}/g, "\n\n");

const stripFrontmatter = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, "");

// Pushes every heading down two levels so a note's own "# Title" sits under its client.
const demote = (text) => text.replace(/^(#+) /gm, "$1## ");

function clientsMd() {
  const dir = join(root, "vault", "Clients");
  const parts = ["# Clients", "", "One section per client: Profile, Memory (facts, newest last), Lessons (from past ads and research)."];
  for (const name of readdirSync(dir).sort()) {
    parts.push("", `# ${name}`);
    for (const [file, label] of [["Profile.md", "Profile"], ["Memory.md", "Memory"], ["Brain.md", "Lessons"]]) {
      const path = join(dir, name, file);
      if (!existsSync(path)) continue;
      const body = stripFrontmatter(readFileSync(path, "utf8").replace(/\r\n/g, "\n"))
        .replace(/^# .*\n/m, "")
        .replace(/^## Lessons\n/m, "")
        .trim();
      parts.push("", `## ${label}`, "", demote(body));
    }
  }
  return clean(parts.join("\n")) + "\n";
}

const clients = clientsMd();
for (const [bot, files] of Object.entries(bots)) {
  const out = join(here, bot, "upload");
  // Empty rather than delete: Windows refuses to remove a folder open in Explorer or a shell.
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) rmSync(join(out, f), { recursive: true, force: true });
  writeFileSync(join(out, "Clients.md"), clients);
  for (const [name, src] of Object.entries(files)) {
    writeFileSync(join(out, name), clean(readFileSync(join(root, src), "utf8").replace(/\r\n/g, "\n")));
  }
  const knowledge = join(here, bot, "knowledge");
  if (existsSync(knowledge)) {
    for (const f of readdirSync(knowledge)) {
      writeFileSync(join(out, basename(f)), clean(readFileSync(join(knowledge, f), "utf8").replace(/\r\n/g, "\n")));
    }
  }
  console.log(`${bot}: ${readdirSync(out).length} files -> ${out}`);
}
