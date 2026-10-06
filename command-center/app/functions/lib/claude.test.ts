import { describe, it, expect } from "vitest";
import { writeWithClaude, type ClaudeCreate } from "./claude";

const schema = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
  additionalProperties: false,
};
const isText = (v: unknown): v is { text: string } =>
  !!v && typeof (v as { text?: unknown }).text === "string";

const reply = (text: string, stop = "end_turn"): ClaudeCreate =>
  async () => ({
    stop_reason: stop,
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  });

const base = { system: "s", input: "i", schema, check: isText };

describe("writeWithClaude", () => {
  it("returns parsed data on success", async () => {
    const r = await writeWithClaude({ ANTHROPIC_API_KEY: "k" }, base, reply('{"text":"hi"}'));
    expect(r).toEqual({ ok: true, data: { text: "hi" }, usage: { input: 10, output: 5 } });
  });

  it("says Claude is not set up without a key", async () => {
    const r = await writeWithClaude({}, base, reply('{"text":"hi"}'));
    expect(r).toEqual({ ok: false, error: "Claude is not set up" });
  });

  it("reports a refusal", async () => {
    const r = await writeWithClaude({ ANTHROPIC_API_KEY: "k" }, base, reply("", "refusal"));
    expect(r.ok).toBe(false);
  });

  it("reports a cut-off answer", async () => {
    const r = await writeWithClaude({ ANTHROPIC_API_KEY: "k" }, base, reply('{"text":"h', "max_tokens"));
    expect(r).toMatchObject({ ok: false, error: "Claude ran out of room, try again" });
  });

  it("rejects an answer that does not match the shape", async () => {
    const r = await writeWithClaude({ ANTHROPIC_API_KEY: "k" }, base, reply('{"other":1}'));
    expect(r.ok).toBe(false);
  });

  it("turns a thrown error into a short message", async () => {
    const boom: ClaudeCreate = async () => {
      throw Object.assign(new Error("overloaded"), { status: 529 });
    };
    const r = await writeWithClaude({ ANTHROPIC_API_KEY: "k" }, base, boom);
    expect(r).toEqual({ ok: false, error: "Claude is busy, try again in a minute" });
  });
});
