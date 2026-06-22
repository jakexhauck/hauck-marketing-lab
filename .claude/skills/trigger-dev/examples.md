# trigger.dev — End-to-End Patterns

Concrete, copy-pasteable patterns for common trigger.dev v4 workflows. Each example includes the task code + the calling code (frontend / backend / webhook) so it works as a complete unit.

All imports from `@trigger.dev/sdk` (v4). Replace `proj_xxx` with your project ref.

---

## 1. Minimal `trigger.config.ts`

```ts
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_xxx",
  dirs: ["./trigger"],
  runtime: "node-22",
  machine: "small-1x",
  maxDuration: 600,
  logLevel: "info",
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 1_000, maxTimeoutInMs: 10_000, factor: 2, randomize: true },
  },
});
```

---

## 2. Basic Validated Task with Retry Policy and Cancellation Support

```ts
// trigger/process-order.ts
import { schemaTask, AbortTaskRunError } from "@trigger.dev/sdk";
import { z } from "zod";

export const processOrder = schemaTask({
  id: "process-order",
  schema: z.object({
    orderId: z.string().uuid(),
    userId: z.string(),
  }),
  retry: { maxAttempts: 5, factor: 2, minTimeoutInMs: 1_000, maxTimeoutInMs: 30_000, randomize: true,
           outOfMemory: { machine: "large-1x" } },
  machine: "small-2x",
  maxDuration: 300,

  catchError: async ({ error }) => {
    if (error instanceof OrderNotFoundError) return { skipRetrying: true };
    if (error instanceof RateLimited)        return { retryAt: error.resetAt };
    return undefined;
  },

  run: async (payload, { ctx, signal }) => {
    if (signal.aborted) throw new AbortTaskRunError("canceled");

    const order = await fetchOrder(payload.orderId, { signal });
    if (!order) throw new OrderNotFoundError(payload.orderId);

    return { processed: true, total: order.total };
  },
});

class OrderNotFoundError extends Error {}
class RateLimited extends Error { constructor(public resetAt: Date) { super("rate limited"); } }

declare function fetchOrder(id: string, opts: { signal: AbortSignal }): Promise<{ total: number } | null>;
```

---

## 3. Triggering from a Next.js App Router Route (Type-Only Import)

```ts
// app/api/orders/[id]/process/route.ts
import { tasks } from "@trigger.dev/sdk";
import type { processOrder } from "@/trigger/process-order";   // TYPE-ONLY
import { NextResponse } from "next/server";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const handle = await tasks.trigger<typeof processOrder>(
    "process-order",
    { orderId: params.id, userId: "u_42" },
    { tags: [`order_${params.id}`, "user_42"], idempotencyKey: `process-${params.id}` },
  );
  return NextResponse.json({ runId: handle.id, accessToken: handle.publicAccessToken });
}
```

Server actions, Pages-Router handlers, Hono, Express, etc. follow the same shape — `tasks.trigger` + type-only task import + `TRIGGER_SECRET_KEY` in env.

---

## 4. Webhook Handler (Stripe-Style Signature Verification)

```ts
// app/api/webhooks/stripe/route.ts
import { tasks } from "@trigger.dev/sdk";
import type { handleStripeEvent } from "@/trigger/stripe";
import Stripe from "stripe";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  // Idempotent on Stripe's event id — prevents replay storms
  await tasks.trigger<typeof handleStripeEvent>("handle-stripe-event", event, {
    idempotencyKey: event.id,
    tags: [`stripe:${event.type}`],
  });

  return NextResponse.json({ ok: true });
}
```

```ts
// trigger/stripe.ts
import { task } from "@trigger.dev/sdk";
import type Stripe from "stripe";

export const handleStripeEvent = task({
  id: "handle-stripe-event",
  run: async (event: Stripe.Event) => {
    switch (event.type) {
      case "checkout.session.completed": /* ... */ break;
      case "invoice.payment_failed":     /* ... */ break;
    }
    return { handled: true };
  },
});
```

---

## 5. Human-in-the-Loop Approval (Waitpoint Token)

```ts
// trigger/publish-post.ts
import { task, wait, logger } from "@trigger.dev/sdk";
import { db } from "@/lib/db";

type Approval = { approved: boolean; reviewerId: string };

export const publishPost = task({
  id: "publish-post",
  run: async (payload: { postId: string }) => {
    const token = await wait.createToken({
      timeout: "24h",
      tags: [`post:${payload.postId}`, "approval"],
    });

    await db.approval.create({
      data: {
        postId: payload.postId,
        tokenId: token.id,
        publicAccessToken: token.publicAccessToken,    // for the frontend
      },
    });

    logger.info("awaiting approval", { tokenId: token.id });
    const result = await wait.forToken<Approval>(token.id);

    if (!result.ok) {
      logger.warn("approval timed out");
      return { published: false, reason: "timeout" };
    }
    if (!result.output.approved) {
      return { published: false, reason: "rejected", reviewer: result.output.reviewerId };
    }

    await db.post.update({ where: { id: payload.postId }, data: { publishedAt: new Date() } });
    return { published: true };
  },
});
```

Frontend completion (uses the run-scoped public token, no secret leakage):

```tsx
"use client";
import { useWaitToken } from "@trigger.dev/react-hooks";

export function ApprovalButtons({ tokenId, accessToken, reviewerId }: { tokenId: string; accessToken: string; reviewerId: string }) {
  const { complete, isLoading } = useWaitToken<{ approved: boolean; reviewerId: string }>(tokenId, { accessToken });
  return (
    <div>
      <button disabled={isLoading} onClick={() => complete({ approved: true,  reviewerId })}>Approve</button>
      <button disabled={isLoading} onClick={() => complete({ approved: false, reviewerId })}>Reject</button>
    </div>
  );
}
```

Server-side completion (e.g. from an admin API):

```ts
import { wait } from "@trigger.dev/sdk";
await wait.completeToken(tokenId, { approved: true, reviewerId: "admin_1" });
```

---

## 6. Multi-Tenant Scheduled Task (Imperative Schedule per User)

```ts
// trigger/user-digest.ts
import { schedules } from "@trigger.dev/sdk";

export const userDigest = schedules.task({
  id: "user-digest",
  run: async (payload) => {
    const userId = payload.externalId!;
    // ...send digest email for userId
    return { sent: true, userId };
  },
});
```

Backend wiring on user signup:

```ts
import { schedules } from "@trigger.dev/sdk";
import type { userDigest } from "@/trigger/user-digest";

const env = process.env.NODE_ENV === "production" ? "prod" : "stg";

export async function enableDailyDigest(userId: string, ianaTimezone: string) {
  await schedules.create({
    task: "user-digest",
    cron: "0 8 * * *",                       // 8am in user's TZ
    timezone: ianaTimezone,
    externalId: userId,
    deduplicationKey: `${userId}-${env}-daily`,   // include env — dedup is project-scoped
  });
}

export async function disableDigest(scheduleId: string) {
  await schedules.deactivate(scheduleId);    // or schedules.del(scheduleId)
}
```

---

## 7. Fan-Out / Fan-In with `batchTriggerAndWait`

```ts
// trigger/process-images.ts
import { task } from "@trigger.dev/sdk";

export const resizeOne = task({
  id: "resize-one",
  machine: "medium-1x",
  run: async (p: { url: string; width: number }) => {
    return { thumbnailUrl: await resize(p.url, p.width) };
  },
});

export const resizeBatch = task({
  id: "resize-batch",
  run: async (payload: { urls: string[] }) => {
    const { runs } = await resizeOne.batchTriggerAndWait(
      payload.urls.map(url => ({ payload: { url, width: 320 } })),
    );

    const results: { url: string; thumb?: string; error?: string }[] = [];
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      results.push(r.ok
        ? { url: payload.urls[i], thumb: r.output.thumbnailUrl }
        : { url: payload.urls[i], error: String(r.error) });
    }
    return { results };
  },
});

declare function resize(url: string, w: number): Promise<string>;
```

Notes:

- During `batchTriggerAndWait` the parent is checkpointed — its concurrency slot is released and CPU billing pauses.
- Children are version-locked to the parent.
- Limit: 1,000 items / 3 MB per item (SDK ≥ 4.3.1).

---

## 8. Per-Tenant Concurrency with `concurrencyKey`

```ts
// trigger/scrape-page.ts
import { task, queue } from "@trigger.dev/sdk";

export const scrapeQueue = queue({ name: "scrape", concurrencyLimit: 50 });

export const scrapePage = task({
  id: "scrape-page",
  run: async (payload: { url: string }) => fetchAndParse(payload.url),
});

declare function fetchAndParse(url: string): Promise<unknown>;
```

```ts
// caller
import { tasks } from "@trigger.dev/sdk";
import type { scrapePage } from "@/trigger/scrape-page";

await tasks.trigger<typeof scrapePage>("scrape-page",
  { url },
  { queue: "scrape", concurrencyKey: tenantId },     // 1 worker per tenant within the queue
);
```

---

## 9. AI Streaming with Realtime Hooks

```ts
// trigger/streams.ts
import { streams } from "@trigger.dev/sdk";

export type AiStreamPart = { type: "text-delta"; textDelta: string } | { type: "finish" };
export const aiStream = streams.define<AiStreamPart>("ai-output");
```

```ts
// trigger/chat.ts
import { schemaTask, metadata } from "@trigger.dev/sdk";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { aiStream } from "./streams";

export const chatTask = schemaTask({
  id: "chat",
  schema: z.object({ prompt: z.string() }),
  run: async ({ prompt }) => {
    const result = streamText({ model: openai("gpt-4o"), prompt });
    await metadata.stream("ai-output", result.fullStream);   // publish to the typed stream

    let text = "";
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") text += part.textDelta;
    }
    return { text };
  },
});
```

```tsx
// app/chat/page.tsx
"use client";
import { useRealtimeTaskTriggerWithStreams } from "@trigger.dev/react-hooks";
import type { chatTask } from "@/trigger/chat";
import { aiStream } from "@/trigger/streams";

export default function Chat({ accessToken }: { accessToken: string }) {
  const { submit, run, streams } = useRealtimeTaskTriggerWithStreams<typeof chatTask, { "ai-output": typeof aiStream }>(
    "chat",
    { accessToken },
  );

  const text = (streams["ai-output"] ?? [])
    .filter(p => p.type === "text-delta")
    .map(p => p.textDelta).join("");

  return (
    <div>
      <button onClick={() => submit({ prompt: "Hello!" })}>Ask</button>
      <pre>{text}</pre>
      {run?.status === "COMPLETED" && <p>done.</p>}
    </div>
  );
}
```

Issue the trigger token on the server:

```ts
import { auth } from "@trigger.dev/sdk";
const accessToken = await auth.createTriggerPublicToken("chat", { multipleUse: true, expirationTime: "1hr" });
```

---

## 10. Prisma in Tasks

```ts
// trigger.config.ts (excerpt)
import { defineConfig } from "@trigger.dev/sdk";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: "proj_xxx",
  build: {
    extensions: [
      prismaExtension({ mode: "modern" }),    // Prisma 6.16+ engineType=client
      // OR for older:
      // prismaExtension({ mode: "legacy", schema: "prisma/schema.prisma", migrate: true }),
    ],
  },
});
```

```ts
// trigger/sync-customers.ts
import { task } from "@trigger.dev/sdk";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const syncCustomers = task({
  id: "sync-customers",
  run: async () => {
    const stale = await prisma.customer.findMany({ where: { syncedAt: { lt: oneHourAgo() } } });
    return { count: stale.length };
  },
});

function oneHourAgo() { return new Date(Date.now() - 3_600_000); }
```

For locked-down environments use `mode: "engine-only"` and run `prisma generate` yourself.

---

## 11. Browser Automation with Playwright

```ts
// trigger.config.ts (excerpt)
import { playwright } from "@trigger.dev/build/extensions/playwright";

export default defineConfig({
  project: "proj_xxx",
  build: {
    extensions: [playwright({ browsers: ["chromium"], headless: true })],
  },
});
```

```ts
// trigger/screenshot.ts
import { task } from "@trigger.dev/sdk";
import { chromium } from "playwright";

export const screenshot = task({
  id: "screenshot",
  machine: "medium-1x",
  maxDuration: 120,
  run: async (payload: { url: string }) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(payload.url, { waitUntil: "networkidle" });
      const buf = await page.screenshot({ fullPage: true });
      const url = await uploadToS3(buf);
      return { url };
    } finally {
      await browser.close();
    }
  },
});

declare function uploadToS3(buf: Buffer): Promise<string>;
```

For Puppeteer use `puppeteer()` extension and set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable` in the env-vars dashboard.

---

## 12. FFmpeg Video Encode

```ts
// trigger.config.ts
import { ffmpeg } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_xxx",
  build: {
    external: ["fluent-ffmpeg"],
    extensions: [ffmpeg({ version: "7" })],
  },
});
```

```ts
// trigger/transcode.ts
import { task } from "@trigger.dev/sdk";
import ffmpeg from "fluent-ffmpeg";

export const transcode = task({
  id: "transcode",
  machine: "large-1x",
  maxDuration: 1800,
  run: async (payload: { input: string; output: string }) => {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(payload.input)
        .videoCodec("libx264")
        .audioCodec("aac")
        .save(payload.output)
        .on("end", () => resolve())
        .on("error", reject);
    });
    return { output: payload.output };
  },
});
```

---

## 13. AI Tool Wrapping a `schemaTask` (Vercel AI SDK)

```ts
// trigger/tools.ts
import { schemaTask } from "@trigger.dev/sdk";
import { ai } from "@trigger.dev/sdk/ai";
import { z } from "zod";

export const lookupCustomer = schemaTask({
  id: "lookup-customer",
  schema: z.object({ email: z.string().email() }),
  run: async ({ email }) => {
    const c = await fetchCustomer(email);
    return c ?? { notFound: true };
  },
});

export const lookupCustomerTool = ai.tool(lookupCustomer);    // replaces deprecated v3 toolTask
declare function fetchCustomer(email: string): Promise<unknown>;
```

```ts
// trigger/agent.ts
import { task } from "@trigger.dev/sdk";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { lookupCustomerTool } from "./tools";

export const agent = task({
  id: "agent",
  run: async (payload: { question: string }) => {
    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt: payload.question,
      tools: { lookupCustomer: lookupCustomerTool },
      maxSteps: 5,
    });
    return { text };
  },
});
```

---

## 14. Syncing Env Vars from Vercel at Deploy Time

```ts
// trigger.config.ts
import { defineConfig } from "@trigger.dev/sdk";
import { syncVercelEnvVars } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_xxx",
  build: { extensions: [syncVercelEnvVars()] },
});
```

Set in your CI / shell before `trigger.dev deploy`:

```
VERCEL_ACCESS_TOKEN=...
VERCEL_PROJECT_ID=prj_...
VERCEL_TEAM_ID=team_...        # optional
```

For Infisical / 1Password / custom, use the generic `syncEnvVars(async (ctx) => ({...}))` form.

---

## 15. Subscribing to a Run from the Frontend (Progress Bar)

```tsx
// app/jobs/[runId]/page.tsx
"use client";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import type { processOrder } from "@/trigger/process-order";

export default function JobPage({ runId, accessToken }: { runId: string; accessToken: string }) {
  const { run, error } = useRealtimeRun<typeof processOrder>(runId, {
    accessToken,
    skipColumns: ["payload"],
    onComplete: (r, err) => console.log("done", r?.status, err),
  });

  if (error) return <p>Error: {String(error)}</p>;
  if (!run)  return <p>Connecting…</p>;

  const progress = (run.metadata?.progress as number | undefined) ?? 0;
  return (
    <div>
      <p>Status: {run.status}</p>
      <progress value={progress} max={1} />
      {run.isCompleted && <pre>{JSON.stringify(run.output, null, 2)}</pre>}
    </div>
  );
}
```

In the task, push progress to metadata:

```ts
import { metadata } from "@trigger.dev/sdk";
metadata.set("progress", 0).flush();
// ...later...
metadata.set("progress", 0.5).flush();
metadata.set("progress", 1).flush();
```

The run-scoped `accessToken` returned from `tasks.trigger(...)` (i.e. `handle.publicAccessToken`) works directly here — no need to mint one separately.

---

## 16. Migrating v2 Code to v4

User pastes:

```ts
// v2 — DO NOT write new code like this
import { TriggerClient, eventTrigger } from "@trigger.dev/sdk";
import { z } from "zod";

const client = new TriggerClient({ id: "my-app", apiKey: process.env.TRIGGER_API_KEY });

client.defineJob({
  id: "send-welcome",
  name: "Send welcome email",
  version: "1.0.0",
  trigger: eventTrigger({ name: "user.signup", schema: z.object({ email: z.string() }) }),
  run: async (payload, io) => {
    await io.runTask("send", async () => sendEmail(payload.email));
  },
});

// caller
await client.sendEvent({ name: "user.signup", payload: { email: "x@y.com" } });
```

Rewrite as v4:

```ts
// trigger/send-welcome.ts
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

export const sendWelcome = schemaTask({
  id: "send-welcome",
  schema: z.object({ email: z.string().email() }),
  run: async (payload) => {
    await sendEmail(payload.email);
    return { sent: true };
  },
});

// caller
import { tasks } from "@trigger.dev/sdk";
import type { sendWelcome } from "@/trigger/send-welcome";

await tasks.trigger<typeof sendWelcome>("send-welcome", { email: "x@y.com" });
```

Delete: the `TriggerClient`, integration packages (`@trigger.dev/openai` etc.), `eventTrigger` registration, `io.runTask` step wrapping, `version` strings (versions are auto on `deploy`). Move config to `trigger.config.ts`.
