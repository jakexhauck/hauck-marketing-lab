import { describe, expect, it } from "vitest";
import { runComposio } from "../src/composioTools.ts";

function recorder(answer: unknown, status = 200) {
  const calls: { url: string; body: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(answer), { status });
  }) as unknown as typeof fetch;
  return { calls, f };
}

describe("runComposio", () => {
  it("refuses a tool not on the agent's list before calling Composio", async () => {
    const { calls, f } = recorder({});
    const r = await runComposio("ads", "GMAIL_SEND_EMAIL", {}, { apiKey: "k", fetchImpl: f });
    expect(r.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
  it("gives the GHL Agent nothing", async () => {
    const { f } = recorder({});
    expect((await runComposio("ghl", "GOOGLEDRIVE_FIND_FILE", {}, { apiKey: "k", fetchImpl: f })).isError).toBe(true);
  });
  it("runs an allowed tool on the connection's own user", async () => {
    const { calls, f } = recorder({ data: { files: [] }, successful: true, error: null });
    const r = await runComposio("manager", "GMAIL_CREATE_EMAIL_DRAFT", { subject: "Hi" }, { apiKey: "k", fetchImpl: f });
    expect(r).toEqual({ text: '{"files":[]}', isError: false });
    expect(calls[0].url).toMatch(/tools\/execute\/GMAIL_CREATE_EMAIL_DRAFT$/);
    expect(calls[0].body).toEqual({ user_id: "jdhauck", arguments: { subject: "Hi" } });
  });
  it("reports Composio's own reason when a tool fails", async () => {
    const { f } = recorder({ data: null, successful: false, error: "Connected account is expired" });
    const r = await runComposio("manager", "GMAIL_FETCH_EMAILS", {}, { apiKey: "k", fetchImpl: f });
    expect(r).toEqual({ text: "Composio could not run GMAIL_FETCH_EMAILS: Connected account is expired", isError: true });
  });
});
