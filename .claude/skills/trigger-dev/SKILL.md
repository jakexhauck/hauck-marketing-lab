---
name: trigger-dev
description: Use when the user writes, edits, debugs, or asks about trigger.dev code — defining background tasks, scheduled (cron) jobs, queues, retries, waits, or any work using `@trigger.dev/sdk`. Triggers on imports from `@trigger.dev/sdk`, edits to `trigger.config.ts` or files under `/trigger/`, and phrases like "create a trigger.dev task", "schedule a cron job", "background job", "wait for approval / human in the loop", "retry on failure", "concurrency queue", "trigger.dev deploy", "idempotency key", "waitpoint token", "realtime run", "schemaTask", "batch trigger". Enforces the current v4 SDK shape — imports from `@trigger.dev/sdk` (NOT `/v3`), `Result<T>` returns from `triggerAndWait`, pre-declared `queue()`, `catchError` instead of `handleError`, the v4 lifecycle hooks, `schedules.task`, build extensions for Prisma / Playwright / FFmpeg / env-sync, and v3→v4 migration deltas — so generated code uses the current SDK and never falls back to deprecated `/v3` imports or legacy v2 `TriggerClient`/`defineJob` patterns.
---

# trigger.dev

Authoring trigger.dev v4 tasks: project shape, task definitions, triggering, scheduling, queues, waits, retries, deployment, and the v3/v2 patterns to NOT emit.

## When to Use This Skill

Use this skill when the user:

- Imports anything from `@trigger.dev/sdk` (or `@trigger.dev/sdk/v3`).
- Edits `trigger.config.ts` or any file under a `/trigger/` directory.
- Asks to create, schedule, retry, queue, batch, or trigger a background job.
- Asks about waitpoints, human-in-the-loop approvals, or `wait.forToken`.
- Asks about realtime run subscriptions or `@trigger.dev/react-hooks`.
- Asks about deployment, machines, build extensions, or `trigger.dev` CLI.
- Pastes a v2 (`new TriggerClient`, `client.defineJob`) or v3 (`@trigger.dev/sdk/v3`) snippet and asks to update or fix it.

Do **not** use this skill for general background-job design questions where the user hasn't picked trigger.dev (e.g., "should I use BullMQ or trigger.dev?" — answer the question without invoking the skill).

## Version Reality (read this first)

Trigger.dev v4 is GA. **v3 deploys stop working April 1, 2026.** Generated code MUST target v4:

- Import from `@trigger.dev/sdk` — **never** `@trigger.dev/sdk/v3` (deprecated).
- v2 (`new TriggerClient(...)`, `client.defineJob({...})`, `eventTrigger`, `cronTrigger`, `io.runTask`, `@trigger.dev/openai`-style integration packages) is **fully removed**. If a user pastes v2 code, rewrite it as v4 tasks.

Key v3→v4 deltas to enforce when writing or rewriting code:

| v3                                | v4 (current)                                            |
|-----------------------------------|---------------------------------------------------------|
| `@trigger.dev/sdk/v3`             | `@trigger.dev/sdk`                                      |
| `handleError`                     | `catchError`                                            |
| `init` task option                | `middleware` + `locals` API                             |
| `toolTask`                        | `ai.tool(schemaTask)`                                   |
| Queue created on trigger          | Pre-declared via `queue({ name, concurrencyLimit })`    |
| `triggerAndWait` returns `T`      | Returns `Result<T>` — use `if (result.ok)` or `.unwrap()` |
| `batchTrigger` returned runs      | Returns batch handle — fetch via `batch.retrieve()`     |
| `ctx.attempt.id`, `.status`       | Removed (only `attempt.number` survives)                |
| `ctx.task.exportName`             | Removed                                                 |
| Hook positional args              | Single object param                                     |

## Project Shape

Minimum project layout:

```
<project-root>/
├── trigger.config.ts          # required, at repo root
├── trigger/                   # default tasks dir (or set via dirs)
│   └── example.ts
└── package.json               # @trigger.dev/sdk + @trigger.dev/build (dev)
```

Bootstrap a fresh project: `npx trigger.dev@latest init`.
Local dev (hot-reload, runs each task in its own Node process): `npx trigger.dev@latest dev`.
Deploy: `npx trigger.dev@latest deploy`.

Required env: `TRIGGER_SECRET_KEY` (key prefix selects environment — `tr_dev_*`, `tr_stg_*`, `tr_prod_*`). For self-host or staging API: `TRIGGER_API_URL`.

## Defining a Task — Canonical v4 Shape

```ts
// trigger/process-order.ts
import { task, AbortTaskRunError } from "@trigger.dev/sdk";

export const processOrder = task({
  id: "process-order",                       // must be unique in the project
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1_000, maxTimeoutInMs: 30_000, randomize: true },
  machine: "small-1x",
  maxDuration: 300,                           // CPU seconds, min 5; excludes wait time

  catchError: async ({ error, retryAt }) => {
    if (error instanceof BadInputError) return { skipRetrying: true };
    if (error instanceof RateLimited)   return { retryAt: error.resetAt };
    return undefined;                         // fall through to default retry policy
  },

  run: async (payload: { orderId: string }, { ctx, signal }) => {
    if (!payload.orderId) throw new AbortTaskRunError("missing orderId"); // no retry
    return { processed: true } satisfies Output;
  },
});

type Output = { processed: boolean };
```

**Hard rules:**

- Tasks MUST be `export`-ed or the worker won't pick them up.
- `id` must be unique across the project.
- Payload and return value must be JSON-serializable (no `Date`, `Map`, `Set`, `BigInt`, class instances unless serialized).
- `maxDuration` is min 5s, measures **CPU time only** — `wait.*` and `triggerAndWait` time don't count, and `cleanup`/`onSuccess`/`onFailure` do NOT run on timeout.
- Throw a normal `Error` to retry; throw `AbortTaskRunError` to fail without retrying; throw `OutOfMemoryError` to escalate to `retry.outOfMemory.machine` if set.

Validated payloads — use `schemaTask` instead of `task` whenever the input has a known shape:

```ts
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

export const newUser = schemaTask({
  id: "new-user",
  schema: z.object({ email: z.string().email(), name: z.string().default("anon") }),
  run: async (payload) => { /* payload typed from schema OUTPUT */ },
});
```

Schema validation failures throw native parser errors (e.g. `ZodError`) at trigger time, and `TaskPayloadParsedError` (no retry) inside the run.

## Scheduled (Cron) Tasks

```ts
import { schedules } from "@trigger.dev/sdk";

export const dailyReport = schedules.task({
  id: "daily-report",
  cron: { pattern: "0 5 * * *", timezone: "America/New_York", environments: ["PRODUCTION"] },
  // Or just: cron: "0 5 * * *"  (UTC)
  run: async (payload) => {
    payload.timestamp;       // Date — scheduled run time (UTC)
    payload.lastTimestamp;   // Date | undefined
    payload.timezone;        // IANA
    payload.scheduleId;      // "sched_..."
    payload.externalId;      // string | undefined (multi-tenant)
    payload.upcoming;        // Date[]
  },
});
```

5-field cron only (NO seconds). Supports `L` for last-occurrence. Declarative schedules sync on `dev`/`deploy`. Multi-tenant schedules created at runtime via `schedules.create({ task, cron, timezone, externalId, deduplicationKey })` — `deduplicationKey` is **project-scoped, not env-scoped**, so include the env in the key for staging vs prod.

## Triggering — Backend vs Inside a Task

**From backend (Next.js routes, server actions, webhook handlers, etc.) — use `tasks.trigger` with a TYPE-ONLY import** so task implementation isn't bundled into the API server:

```ts
import { tasks } from "@trigger.dev/sdk";
import type { processOrder } from "@/trigger/process-order";       // type-only

const handle = await tasks.trigger<typeof processOrder>(
  "process-order",
  { orderId: "abc" },
  { delay: "1h", tags: ["user_42"], idempotencyKey: "order-abc", queue: "vip" },
);
// handle = { id, publicAccessToken (15m, scoped to this run) }

const batch = await tasks.batchTrigger<typeof processOrder>("process-order", [
  { payload: { orderId: "a" } },
  { payload: { orderId: "b" }, options: { tags: "high-pri" } },
]);
```

**From inside another task** — use the imported task value:

```ts
import { childTask } from "./child";

await childTask.trigger({ ... });                                       // fire-and-forget
const result = await childTask.triggerAndWait({ ... });                 // Result<T>
if (result.ok) result.output; else result.error;
const out = await childTask.triggerAndWait({ ... }).unwrap();           // throws on failure
const { runs } = await childTask.batchTriggerAndWait([{ payload: 1 }, { payload: 2 }]);
```

Mixed-task batch:

```ts
import { batch } from "@trigger.dev/sdk";
await batch.triggerByTaskAndWait([
  { task: t1, payload: { a: 1 } },
  { task: t2, payload: { b: 2 } },
]);
```

**Trigger options** (all optional unless noted):

```
delay              "1h" | "1h52m18s" | ISO string | Date
ttl                "24h" | seconds — drops if not started in window (dev caps at 10m)
idempotencyKey     string | IdempotencyKey from idempotencyKeys.create(...)
idempotencyKeyTTL  default "30d"
tags               string | string[] — max 10/run, 1–128 chars each
metadata           object — max 256KB (NOT inherited by children)
maxAttempts        overrides task setting
maxDuration        seconds, min 5
priority           seconds offset for dequeue (higher = sooner; only within your org)
queue              "name" or { name, concurrencyLimit }
concurrencyKey     splits a queue into per-key sub-queues (multi-tenant)
machine            preset string (see below)
region             e.g. "eu-central-1"
debounce           { key, delay, mode: "leading"|"trailing", maxDelay? }
```

## Waits and Human-in-the-Loop

Any wait > 5s **checkpoints the run**: the process is frozen, the concurrency slot is released, and CPU billing pauses until resumption.

```ts
import { wait } from "@trigger.dev/sdk";

await wait.for({ minutes: 5 });
await wait.for({ hours: 1 }, { idempotencyKey: "k", idempotencyKeyTTL: "1h" });
await wait.until({ date: future, throwIfInThePast: true });

// Waitpoint token (HITL approvals, external callbacks)
const token = await wait.createToken({ timeout: "10m", tags: ["approval"] });
// token = { id, url (server-only), publicAccessToken (CORS-safe), isCached }

const result = await wait.forToken<{ approved: boolean }>(token.id);
if (result.ok) result.output.approved;

// From the server: await wait.completeToken(token.id, { approved: true });
// From the browser: POST to /api/v1/waitpoints/tokens/<id>/complete with publicAccessToken.
```

`wait.forRequest` does NOT exist in the current SDK — the only public waits are `wait.for`, `wait.until`, `wait.forToken` plus `createToken`/`completeToken`.

## Queues, Concurrency, Idempotency, Tags, Metadata

Queues — **must be pre-declared in v4**:

```ts
import { queue, queues } from "@trigger.dev/sdk";

export const vipQueue = queue({ name: "vip", concurrencyLimit: 5 });

await myTask.trigger(p, { queue: "vip", concurrencyKey: userId });   // per-tenant fairness

await queues.pause("queue_..."); await queues.resume("queue_...");
await queues.overrideConcurrencyLimit("queue_...", 10);
```

Idempotency:

```ts
import { idempotencyKeys } from "@trigger.dev/sdk";
const key = await idempotencyKeys.create("send-confirm-" + orderId);   // scope: "run" by default
await sendEmail.trigger(p, { idempotencyKey: key, idempotencyKeyTTL: "1h" });
// scopes: "run" (default) | "attempt" | "global"
```

In SDK ≥ 4.3.1 a raw string defaults to `"run"` scope (was `"global"`). Failed runs auto-release the key; successful/canceled runs retain it until TTL or `idempotencyKeys.reset(...)`.

Tags (max 10/run, 1–128 chars; do NOT auto-propagate to children):

```ts
import { tags } from "@trigger.dev/sdk";
await myTask.trigger(p, { tags: ["user_123", "video:42"] });
// inside run:
await tags.add("processed");
```

Metadata (256KB cap, must be a JSON object — top-level array NOT allowed; does NOT propagate to children):

```ts
import { metadata } from "@trigger.dev/sdk";
metadata.set("progress", 0.5).append("logs", "step 1").increment("counter", 1);
metadata.parent.set("subProgress", 0.5);
metadata.root.append("auditLog", { ts: Date.now() });
await metadata.flush();
```

## Retries, Errors, Logging

Retries default to 3 attempts (1s→10s exponential, factor 2, jittered) and are **OFF in dev** unless `retries.enabledInDev: true` is set in `trigger.config.ts`. Helpers:

```ts
import { retry, AbortTaskRunError, OutOfMemoryError, logger } from "@trigger.dev/sdk";

await retry.onThrow(async ({ attempt }) => doIt(), { maxAttempts: 3 });
await retry.fetch(url, { retry: { byStatus: { "429": { strategy: "headers", limitHeader: "x-ratelimit-limit", remainingHeader: "x-ratelimit-remaining", resetHeader: "x-ratelimit-reset", resetFormat: "unix_timestamp_in_ms" }, "500-599": { strategy: "backoff", maxAttempts: 10 } } } });

logger.info("msg", { key: "v" });
const x = await logger.trace("step", async (span) => { span.setAttribute("a", 1); return doIt(); });
```

`console.*` is auto-intercepted in production runs. Disable via `disableConsoleInterceptor: true` in config.

## Realtime / Frontend (`@trigger.dev/react-hooks`)

```tsx
"use client";
import { useRealtimeRun, useTaskTrigger, useWaitToken } from "@trigger.dev/react-hooks";
import type { processOrder } from "@/trigger/process-order";

const { run, error } = useRealtimeRun<typeof processOrder>(runId, { accessToken });
const { submit, handle } = useTaskTrigger<typeof processOrder>("process-order", { accessToken: triggerToken });
const { complete } = useWaitToken(tokenId, { accessToken: token.publicAccessToken });
```

Server creates scoped public tokens:

```ts
import { auth } from "@trigger.dev/sdk";
const t = await auth.createPublicToken({
  scopes: { read: { runs: ["run_..."], tags: ["user_42"] } },
  expirationTime: "1hr",                                    // default 15min
});
const tt = await auth.createTriggerPublicToken("process-order");          // single-use
const tt2 = await auth.createTriggerPublicToken("process-order", { multipleUse: true, expirationTime: "24hr" });
```

Streams (typed): `streams.define<T>("name")` in a shared module; `await metadata.stream("name", iterable)` in the task; `useRealtimeStream(streamDef, runId, { accessToken })` on the frontend. (`metadata.stream` exists but the typed `streams.define`/`streams.read` API in SDK ≥ 4.1.0 is preferred.)

## `trigger.config.ts` Essentials

```ts
import { defineConfig } from "@trigger.dev/sdk";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";
import { syncEnvVars, additionalFiles, ffmpeg } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_xxx",                          // REQUIRED
  dirs: ["./trigger"],
  runtime: "node-22",                           // "node" | "node-22" | "bun"
  machine: "small-1x",
  maxDuration: 600,
  logLevel: "info",
  retries: { enabledInDev: false, default: { maxAttempts: 3, minTimeoutInMs: 1_000, maxTimeoutInMs: 10_000, factor: 2, randomize: true } },
  build: {
    external: ["sharp"],
    extensions: [
      prismaExtension({ mode: "modern" }),                                    // or "legacy" | "engine-only"
      syncEnvVars(async (ctx) => ({ MY_VAR: process.env.MY_VAR! })),
      additionalFiles({ files: ["./assets/**"] }),
      ffmpeg(),
    ],
  },
});
```

Build extensions available (`@trigger.dev/build/extensions/...`): `prismaExtension`, `syncEnvVars` (+ `syncVercelEnvVars`, `syncNeonEnvVars`, `syncSupabaseEnvVars`), `additionalFiles`, `additionalPackages`, `esbuildPlugin`, `ffmpeg`, `audioWaveform`, `puppeteer`, `playwright`, `lightpanda`, `aptGet`. See [reference.md](reference.md) for full options.

Heavy imports inside `trigger.config.ts` are bundled into every worker — slows cold starts. Use `build.external` aggressively.

## Machine Presets

| Preset       | vCPU | Memory  |
|--------------|------|---------|
| `micro`      | 0.25 | 0.25 GB |
| `small-1x` * | 0.5  | 0.5 GB  |
| `small-2x`   | 1    | 1 GB    |
| `medium-1x`  | 1    | 2 GB    |
| `medium-2x`  | 2    | 4 GB    |
| `large-1x`   | 4    | 8 GB    |
| `large-2x`   | 8    | 16 GB   |

\* default. Set per-task via `machine: "large-1x"`, per-trigger via `{ machine: "large-2x" }`, or escalate on OOM via `retry: { outOfMemory: { machine: "large-1x" } }`.

## CLI Quick Reference

```
npx trigger.dev@latest init                            # bootstrap
npx trigger.dev@latest dev                             # local dev
npx trigger.dev@latest deploy [-e prod|staging|preview] [-b branch] [--dry-run] [--skip-promotion]
npx trigger.dev@latest promote 20250108.5
npx trigger.dev@latest login | logout | whoami | list-profiles | switch <name>
npx trigger.dev@latest update                          # bumps @trigger.dev/* deps
```

CI auth: `TRIGGER_ACCESS_TOKEN` (and `TRIGGER_API_URL` for self-host).

## Hard Limits to Remember

- Single trigger payload: 3 MB. Per-batch-item payload: 3 MB. Batch size: 1,000 items (SDK ≥ 4.3.1; 500 prior).
- Task output: 10 MB. I/O packet: 128 KB (hardcoded, not configurable even self-host).
- Tags: 10/run, 1–128 chars. Metadata: 256 KB.
- `maxDuration` minimum: 5 seconds. Cloud TTL hard cap: 14 days.
- API requests: 1,500/min.
- `idempotencyKeyTTL` default: 30 days.
- Public access token default expiry: 15 minutes.

## Top Gotchas

1. **Imports.** Always `from "@trigger.dev/sdk"`. The `/v3` suffix is deprecated; v2 (`TriggerClient`, `defineJob`, `eventTrigger`, `cronTrigger`, `io.runTask`) is gone.
2. **`triggerAndWait` returns `Result<T>`** — check `result.ok` or call `.unwrap()`. Treating the return as the output directly is a v3 pattern.
3. **Tasks must be `export`-ed.** Unexported tasks aren't registered.
4. **Type-only imports for backend triggering.** `import type { myTask } from "@/trigger/myTask"` + `tasks.trigger<typeof myTask>("id", payload)` — prevents task code from being bundled into the API server (critical for Next.js).
5. **Retries are OFF in dev** unless `retries.enabledInDev: true`.
6. **`maxDuration` measures CPU time, min 5s** — wait time excluded; lifecycle hooks don't run on timeout.
7. **Metadata and tags do NOT propagate to children.** Pass through payload, or use `metadata.parent`/`metadata.root`/`tags: ctx.run.tags`.
8. **Queues must be pre-declared** with `queue({ name, concurrencyLimit })` in v4. Inline `queue: { concurrencyLimit: N }` on the task is fine; ad-hoc queue creation at trigger time is not.
9. **Schedule `deduplicationKey` is project-scoped, not env-scoped.** Include the env in the key (`${userId}-prod-daily`).
10. **Payloads/outputs must be JSON-serializable.** No `Date` round-trip safety unless you serialize; no `Map`/`Set`/`BigInt`/class instances.
11. **`AbortTaskRunError` skips retries.** A normal `throw` retries. `OutOfMemoryError` (or detected V8 OOM) escalates to `retry.outOfMemory.machine` if set; otherwise the run is `CRASHED`.
12. **`runs.replay` runs on the LATEST deployed version** (pick this to re-run with a bug fix). Retries stay on the original version. `triggerAndWait`/`batchTriggerAndWait` lock children to the parent's version; plain `trigger`/`batchTrigger` use latest.
13. **Heavy imports in `trigger.config.ts` slow every cold start.** They get bundled into every worker.
14. **Tag/metadata mutators are no-ops outside a run context.** `metadata.set(...)` from a backend route does nothing — use the management API or pass via trigger options.
15. **Self-host caveat:** the 128 KB I/O packet limit is hardcoded; the docker provider doesn't enforce per-task resource limits and gives task containers Docker socket access.

## See Also

- [reference.md](reference.md) — full API surface (every task option, all wait/queue/idempotency/metadata methods, all build extensions with options, full CLI flags, every limit, full `ctx` shape, run management API, `auth` API).
- [examples.md](examples.md) — end-to-end patterns: HITL approval flow, AI streaming with realtime hooks, multi-tenant scheduling, fan-out batch processing, Next.js webhook handler, Prisma + Playwright deployments.
