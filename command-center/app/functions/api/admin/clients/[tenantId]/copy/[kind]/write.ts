import type { Env, ApiData } from "../../../../../../lib/env";
import { getServiceClient } from "../../../../../../lib/supabase";
import { writeWithClaude } from "../../../../../../lib/claude";
import { loadClientFacts } from "../../../../../../lib/clientFacts";
import { copyCheck, copyPrompt, copySchema } from "../../../../../../lib/followUpPrompts";
import { logAiRun, readCopy, saveCopy } from "../../../../../../lib/clientCopyStore";
import { aiKeys, isCopyKind } from "../../../../../../../src/lib/followUpCopy";

// POST /api/admin/clients/:tenantId/copy/:kind/write   body { only?: key }
//
// Claude writes this client's texts from their facts (functions/lib/clientFacts)
// and the SOP-based prompt (functions/lib/followUpPrompts). With `only`, Claude
// still writes the set (so the texts stay varied against each other) but only
// that one replaces what is saved, so Jake's edits to the rest survive.

type Params = "tenantId" | "kind";

export const onRequestPost: PagesFunction<Env, Params, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const kind = ctx.params.kind as string;
  if (!isCopyKind(kind)) return Response.json({ error: "Unknown kind" }, { status: 404 });
  const tenantId = ctx.params.tenantId as string;

  let only: string | null = null;
  try {
    const body = (await ctx.request.json()) as { only?: unknown };
    if (typeof body.only === "string" && aiKeys(kind).includes(body.only)) only = body.only;
  } catch {
    // No body: write the whole set.
  }

  const facts = await loadClientFacts(client, tenantId);
  if (!facts) return Response.json({ error: "Client not found" }, { status: 404 });

  const current = await readCopy(client, tenantId, kind, facts.businessName);
  const { system, input } = copyPrompt(kind, facts, current.settings);
  const result = await writeWithClaude(ctx.env, {
    system,
    input,
    schema: copySchema(kind),
    check: copyCheck(kind),
  });
  await logAiRun(client, {
    tenantId,
    kind: `copy.${kind}`,
    ok: result.ok,
    error: result.ok ? undefined : result.error,
    input: result.ok ? result.usage.input : 0,
    output: result.ok ? result.usage.output : 0,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });

  const items = current.items.map((i) => {
    const fresh = result.data[i.key];
    if (typeof fresh !== "string") return i;
    if (only && i.key !== only) return i;
    return { key: i.key, text: fresh.trim() };
  });
  try {
    await saveCopy(client, tenantId, kind, { items, settings: current.settings, written: true });
    return Response.json(await readCopy(client, tenantId, kind, facts.businessName));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
};
