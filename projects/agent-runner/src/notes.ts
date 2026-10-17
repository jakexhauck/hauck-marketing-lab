// Notes the runner owes a chat on its next turn, one small file per chat, so a
// restart between turns does not lose them. Today the only one is "your brief
// block was not saved, Jake edited it" (runner.ts, staleBriefNote).
//
// The chat id comes from the app and becomes a file name, so anything that is
// not a plain id is ignored rather than allowed to name a path.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BriefNotes } from "./runner.ts";

const SAFE_ID = /^[0-9a-zA-Z-]{1,64}$/;

export function fileBriefNotes(dir: string): BriefNotes {
  const file = (chatId: string) => (SAFE_ID.test(chatId) ? join(dir, `${chatId}.txt`) : null);
  return {
    get(chatId) {
      const f = file(chatId);
      return f && existsSync(f) ? readFileSync(f, "utf8") : null;
    },
    set(chatId, text) {
      const f = file(chatId);
      if (!f) return;
      mkdirSync(dir, { recursive: true });
      writeFileSync(f, text);
    },
    clear(chatId) {
      const f = file(chatId);
      if (f) rmSync(f, { force: true });
    },
  };
}
