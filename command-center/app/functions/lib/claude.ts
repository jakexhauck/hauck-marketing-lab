import Anthropic from "@anthropic-ai/sdk";

// Claude, from the server, for the client setup pages (Follow-up Texts, the
// lead form checkmarks). One call shape: a system prompt, the client's facts,
// a JSON schema the answer must match, and a guard that proves it did.
//
// Structured output (output_config.format) makes Claude answer in the schema;
// the guard is still run because a cut-off or refused answer is not caught by
// the schema. The server-side fallback is on (Anthropic retries a refused
// request on another model inside the same call).
//
// The SDK call is injected so the tests never touch the network.

export const CLAUDE_MODEL = "claude-opus-5-5";

export interface ClaudeReply {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export type ClaudeCreate = (apiKey: string, params: Record<string, unknown>) => Promise<ClaudeReply>;

export const sdkCreate: ClaudeCreate = async (apiKey, params) => {
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  // Beta path: the fallback parameter lives there.
  return (await client.beta.messages.create(params as never)) as unknown as ClaudeReply;
};

export type ClaudeResult<T> =
  | { ok: true; data: T; usage: { input: number; output: number } }
  | { ok: false; error: string };

export async function writeWithClaude<T>(
  env: { ANTHROPIC_API_KEY?: string },
  opts: {
    system: string;
    input: string;
    schema: Record<string, unknown>;
    check: (v: unknown) => v is T;
    maxTokens?: number;
  },
  create: ClaudeCreate = sdkCreate,
): Promise<ClaudeResult<T>> {
  const key = (env.ANTHROPIC_API_KEY ?? "").trim();
  if (!key) return { ok: false, error: "Claude is not set up" };

  let reply: ClaudeReply;
  try {
    reply = await create(key, {
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: [{ role: "user", content: opts.input }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: opts.schema } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 0;
    if (status === 429 || status === 529 || status >= 500) {
      return { ok: false, error: "Claude is busy, try again in a minute" };
    }
    if (status === 401) return { ok: false, error: "Claude key is not valid" };
    return { ok: false, error: "Claude did not answer" };
  }

  if (reply.stop_reason === "refusal") return { ok: false, error: "Claude would not write this one" };
  if (reply.stop_reason === "max_tokens") return { ok: false, error: "Claude ran out of room, try again" };

  const text = reply.content.find((b) => b.type === "text")?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Claude's answer was not readable" };
  }
  if (!opts.check(parsed)) return { ok: false, error: "Claude's answer was missing a part" };

  return {
    ok: true,
    data: parsed,
    usage: { input: reply.usage?.input_tokens ?? 0, output: reply.usage?.output_tokens ?? 0 },
  };
}
