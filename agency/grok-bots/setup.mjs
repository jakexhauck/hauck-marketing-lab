// Writes <bot>/setup.txt: the one message Jake pastes into a bot's chat to set
// it up (Grok Bot has no instructions field, so a bot is set up by chat).
// Built from bot.md, so run it again after a bot.md changes:
//   node agency/grok-bots/setup.mjs
// rules.md changes need no re-paste: get_rules serves them live.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BOTS = ["executive-assistant", "success-manager", "ads", "creative", "market-research", "ghl"];

/** The text under each "## " heading of a bot.md. */
function sections(md) {
  const out = {};
  let key = null;
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const h = /^## (.+)$/.exec(line);
    if (h) key = h[1].trim();
    else if (key) out[key] = `${out[key] ?? ""}${line}\n`;
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}

for (const bot of BOTS) {
  const s = sections(readFileSync(join(HERE, bot, "bot.md"), "utf8"));
  const routines = s.Routines && s.Routines !== "None." ? s.Routines : "None.";
  const msg = [
    "SETUP. Save everything in this message as your standing instructions and follow it in every chat from now on, including group chats and routines.",
    "",
    `Your name: ${s.Name}`,
    `Your title: ${s.Title}`,
    `What you do: ${s.Description}`,
    "",
    "INSTRUCTIONS",
    "",
    s.Instructions,
    "",
    "ROUTINES",
    "",
    routines,
    "",
    "NOW DO THIS",
    "",
    routines === "None."
      ? "1. Save the instructions above."
      : "1. Save the instructions above, and create each routine above as a scheduled routine at the day and time given, US Eastern time, with the quoted text as its task.",
    `2. Call Hauck Brain \`get_rules\` with bot \`${bot}\` to check the connector works.`,
    "3. Reply in 3 short lines: instructions saved, routines made (with their times, or none), connector working or not.",
    "",
  ].join("\n");
  writeFileSync(join(HERE, bot, "setup.txt"), msg);
  console.log(`${bot}/setup.txt`);
}
