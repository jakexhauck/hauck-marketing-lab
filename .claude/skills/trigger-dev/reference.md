# trigger.dev Full API Reference

Complete v4 SDK surface. All imports from `@trigger.dev/sdk` unless noted. Verified against https://trigger.dev/docs.

---

## 1. SDK Imports

```ts
import {
  // task definition
  task, schemaTask, schedules, queue,
  // global lifecycle / locals
  tasks, locals,
  // triggering / batching
  batch,
  // runtime helpers
  metadata, logger, wait, retry, usage, tags, idempotencyKeys, ai,
  // management API
  configure, runs, queues, envvars, auth,
  // streams
  streams,
  // errors
  AbortTaskRunError, OutOfMemoryError, BatchTriggerError, SubtaskUnwrapError,
  // helpers
  defineConfig,
} from "@trigger.dev/sdk";

import { ai } from "@trigger.dev/sdk/ai";   // ai.tool() helper
```

`metadata`, `logger`, `wait`, `retry`, `usage`, `tags`, `idempotencyKeys`, runtime `tasks` hooks — only valid **inside a running task or its lifecycle hooks**. Outside a run context they no-op or throw.

---

## 2. `task()` — All Options

```ts
task({
  id: string,                                            // REQUIRED, unique per project
  run: (payload, { ctx, signal }) => Promise<Output>,    // REQUIRED, signal = AbortSignal

  // retry
  retry?: {
    maxAttempts?: number,             // default 3
    factor?: number,                  // default 2
    minTimeoutInMs?: number,          // default 1000
    maxTimeoutInMs?: number,          // default 10_000
    randomize?: boolean,              // default true
    outOfMemory?: { machine: MachinePreset },
  },

  // queue / concurrency
  queue?: { name?: string; concurrencyLimit?: number },

  // machine
  machine?: MachinePreset | { preset: MachinePreset },

  // timing
  maxDuration?: number,               // CPU seconds, min 5
  ttl?: string | number,              // "1h" or seconds; drops if not started in window

  // lifecycle (single object param each, v4)
  middleware?: ({ payload, ctx, next }) => Promise<void>,
  onStartAttempt?: ({ payload, ctx }) => Promise<void>,
  onWait?: ({ wait, payload, ctx }) => Promise<void>,
  onResume?: ({ wait, payload, ctx }) => Promise<void>,
  onSuccess?: ({ payload, output, ctx }) => Promise<void>,
  onComplete?: ({ payload, output, ctx }) => Promise<void>,    // output = { ok, data?, error? }
  onFailure?: ({ payload, error, ctx }) => Promise<void>,      // after final attempt fails
  onCancel?: ({ ctx, signal, runPromise }) => Promise<void>,

  catchError?: ({ error, payload, ctx, retryAt }) =>
    Promise<undefined | { skipRetrying?: boolean; retryAt?: Date; retry?: RetryOptions }>,

  // deprecated v3 (still functional, prefer v4 equivalents)
  onStart?: ({ payload, ctx }) => Promise<void>,                // → onStartAttempt
  init?:    ({ payload, ctx }) => Promise<any>,                 // → middleware + locals
  cleanup?: ({ payload, ctx }) => Promise<void>,                // → middleware
})
```

### `locals` API (v4 replacement for `init` shared state)

```ts
import { locals, tasks } from "@trigger.dev/sdk";

const DbKey = locals.create<Db>("db");
tasks.middleware("db", async ({ ctx, next }) => {
  locals.set(DbKey, await connect());
  await next();
});

// inside run:
const db = locals.getOrThrow(DbKey);
```

### Global hooks (apply to every task)

```ts
import { tasks } from "@trigger.dev/sdk";
tasks.onSuccess(async ({ payload, output, ctx }) => {});
tasks.onFailure(async ({ payload, error, ctx }) => {});
tasks.middleware("auth", async ({ ctx, next }) => { await next(); });
```

Or top-level in `trigger.config.ts` via `onStart`/`onSuccess`/`onFailure`.

---

## 3. `schemaTask()`

```ts
schemaTask({
  id: string,
  schema: ZodSchema | YupSchema | ArkType | EffectSchema | Superstruct | StandardSchema | ParserFn,
  run: (payload, { ctx, signal }) => Promise<Output>,
  // ...all options from task()
})
```

- `payload` is typed from the schema's **output** type.
- Validation errors from the parser (e.g. `ZodError`) throw at trigger time.
- Validation failures inside the run throw `TaskPayloadParsedError` and **do not retry**.

---

## 4. `schedules.task()` and Schedule Management

```ts
schedules.task({
  id: string,
  cron: string | { pattern: string; timezone?: string; environments?: ("DEVELOPMENT"|"STAGING"|"PRODUCTION"|"PREVIEW")[] },
  run: (payload: ScheduledPayload, { ctx }) => Promise<unknown>,
  // ...all task options
})

interface ScheduledPayload {
  timestamp: Date;
  lastTimestamp?: Date;
  timezone: string;          // IANA, default "UTC"
  scheduleId: string;
  externalId?: string;
  upcoming: Date[];          // next 5
}
```

### Cron format

```
*    *    *    *    *
min  hour dom  mon  dow
0-59 0-23 1-31 1-12 0-7 (0/7=Sunday)
```

5 fields, **no seconds**. Supports `L` (`L` = last day-of-month, `1L` = last Monday).

### Imperative schedule API (multi-tenant)

```ts
import { schedules } from "@trigger.dev/sdk";

await schedules.create({
  task: "daily-report",
  cron: "0 8 * * *",
  timezone: "America/New_York",
  externalId: "user_123",
  deduplicationKey: "user_123-prod-daily",   // PROJECT-scoped — include env in key!
});

await schedules.retrieve(id);
await schedules.list({ page, perPage });
await schedules.update(id, { cron, externalId, deduplicationKey });
await schedules.deactivate(id);
await schedules.activate(id);
await schedules.del(id);
await schedules.timezones();                  // valid IANA strings
```

---

## 5. Triggering

### From backend (type-only import preferred)

```ts
import { tasks, batch } from "@trigger.dev/sdk";
import type { myTask } from "@/trigger/myTask";

await tasks.trigger<typeof myTask>("my-task", payload, options);
await tasks.batchTrigger<typeof myTask>("my-task", items);
await tasks.triggerAndPoll<typeof myTask>("my-task", payload, { pollIntervalMs: 1000 });

// Mixed-task batch
await batch.trigger<typeof t1 | typeof t2>([
  { id: "t1", payload: { ... } },
  { id: "t2", payload: { ... } },
]);
await batch.triggerByTask([{ task: t1, payload }, { task: t2, payload }]);
await batch.triggerByTaskAndWait([...]);
```

### From inside a task

```ts
await childTask.trigger(payload, options);
const result = await childTask.triggerAndWait(payload);          // Result<Output>
const out = await childTask.triggerAndWait(payload).unwrap();
const { runs } = await childTask.batchTriggerAndWait([...]);
```

### Trigger options (full)

| Option | Type | Notes |
|---|---|---|
| `delay` | `string \| Date` | "1h", "1h52m18s", or absolute |
| `ttl` | `string \| number` | drops queued; 0 disables; dev caps at 10m |
| `idempotencyKey` | `string \| IdempotencyKey` | dedup |
| `idempotencyKeyTTL` | `string` | default `"30d"` |
| `tags` | `string \| string[]` | max 10/run, 1–128 chars |
| `metadata` | `Record<string, unknown>` | starting metadata, 256KB |
| `maxAttempts` | `number` | overrides task |
| `maxDuration` | `string \| number` | overrides task; min 5s |
| `priority` | `number` | seconds offset for dequeue |
| `queue` | `string \| { name?, concurrencyLimit }` | named queue or override |
| `concurrencyKey` | `string` | per-key sub-queues |
| `machine` | preset | overrides task |
| `region` | `string` | e.g. `eu-central-1` |
| `debounce` | `{ key, delay, mode?, maxDelay? }` | trailing/leading consolidation |

### Streaming batch payloads

```ts
async function* gen() {
  for (const id of payload.ids) yield { payload: { id } };
}
await myTask.batchTrigger(gen());     // also accepts ReadableStream
```

### Batch-trigger error handling

```ts
import { BatchTriggerError } from "@trigger.dev/sdk";

try {
  await tasks.batchTrigger("t", items);
} catch (e) {
  if (e instanceof BatchTriggerError && e.isRateLimited) {
    await new Promise(r => setTimeout(r, e.retryAfterMs ?? 10_000));
  }
}
```

---

## 6. Wait API

```ts
import { wait } from "@trigger.dev/sdk";

// time-based
await wait.for({ seconds | minutes | hours | days | weeks | months | years: number });
await wait.for({ minutes: 5 }, { idempotencyKey, idempotencyKeyTTL: "1h" });

// date-based
await wait.until({ date: Date, throwIfInThePast?: boolean, idempotencyKey?, idempotencyKeyTTL? });

// waitpoint tokens
const token = await wait.createToken({
  timeout?: string,           // default "10m"
  idempotencyKey?: string,
  idempotencyKeyTTL?: string,
  tags?: string[],
});
// token = { id: "waitpoint_...", url, publicAccessToken, isCached }

const result = await wait.forToken<TPayload>(token.id);  // Result<TPayload>
const data = await wait.forToken<TPayload>(token.id).unwrap();

// complete from server
await wait.completeToken<TPayload>(token.id, data);
```

Browser completion endpoint:

```
POST https://api.trigger.dev/api/v1/waitpoints/tokens/<id>/complete
Authorization: Bearer <token.publicAccessToken>
Content-Type: application/json
{ "data": { ... } }
```

`wait.forRequest` is **not** part of the public API.

---

## 7. Idempotency

```ts
import { idempotencyKeys } from "@trigger.dev/sdk";

const k1 = await idempotencyKeys.create("k", { scope: "run" });        // default in tasks
const k2 = await idempotencyKeys.create("k", { scope: "attempt" });
const k3 = await idempotencyKeys.create("k", { scope: "global" });

await idempotencyKeys.reset("my-task", "k");
await idempotencyKeys.reset("my-task", "k", { scope: "global" });
await idempotencyKeys.reset("my-task", "k", { scope: "run", parentRunId: "run_..." });
await idempotencyKeys.reset("my-task", "k", { scope: "attempt", parentRunId: "run_...", attemptNumber: 1 });
```

| Scope | Hashed with | Behavior |
|---|---|---|
| `"run"` | key + parentRunId | unique per parent run (default) |
| `"attempt"` | key + parentRunId + attemptNumber | different per retry |
| `"global"` | key only | "run once ever" |

Raw string passed as `idempotencyKey` defaults to `"run"` scope (changed in 4.3.1; was `"global"` before). Backend code (no run context) treats all scopes as global.

Default `idempotencyKeyTTL`: 30 days. Failed runs auto-release; successful/canceled retain until TTL or manual reset.

---

## 8. Tags

```ts
import { tags } from "@trigger.dev/sdk";

await myTask.trigger(p, { tags: ["user_123", "video:42"] });

// inside run
ctx.run.tags;             // string[] — initial tags
await tags.add("processed");
```

Limits: 10/run, 1–128 chars each. Tags do NOT propagate to children — pass `tags: ctx.run.tags` explicitly.

Filter listing:

```ts
for await (const r of runs.list({ tag: "user_123", status: ["COMPLETED"] })) {}
```

---

## 9. Metadata

```ts
import { metadata } from "@trigger.dev/sdk";

metadata.set(key, val);
metadata.get(key);
metadata.current();
metadata.del(key);
metadata.replace({ ... });
metadata.append(key, val);
metadata.remove(key, val);
metadata.increment(key, n);
metadata.decrement(key, n);
await metadata.flush();

// cross-run mutation
metadata.parent.set/get/append/del/replace/remove/increment/decrement(...);
metadata.root.set/get/append/del/replace/remove/increment/decrement(...);
```

- 256 KB cap.
- Top-level **must be an object** — array root invalid.
- Methods are no-ops outside a run context.
- Does NOT propagate to children — pass via trigger options or payload.
- Setter methods are chainable.

`metadata.stream(key, asyncIterable)` exists but the typed `streams.define`/`streams.read` API in SDK ≥ 4.1.0 is the canonical replacement.

---

## 10. Queues

```ts
import { queue, queues } from "@trigger.dev/sdk";

export const vipQueue = queue({ name: "vip", concurrencyLimit: 5 });

// at task scope (anonymous queue)
export const t = task({
  id: "t",
  queue: { concurrencyLimit: 1 },
  run: async () => {},
});

// override at trigger
await t.trigger(p, { queue: "vip", concurrencyKey: userId });

// management
await queues.list({ page: 1, perPage: 20 });
await queues.retrieve("queue_...");
await queues.retrieve({ type: "task", name: "my-task" });
await queues.pause(idOrSelector);
await queues.resume(idOrSelector);
await queues.overrideConcurrencyLimit(idOrSelector, 5);   // 0 – 100,000
await queues.resetConcurrencyLimit(idOrSelector);
```

Notes:

- v4 requires queues to be defined ahead of time (via `queue({...})` or task `queue` config). Ad-hoc creation at trigger time is no longer supported.
- Only `EXECUTING` runs count against concurrency. `WAITING`/`QUEUED`/`DELAYED` do not.
- Concurrency releases on waitpoint checkpoint — prevents parent/child deadlocks.
- `concurrencyKey` partitions a queue into per-key sub-queues (multi-tenant fairness).
- `priority` is a seconds offset for dequeue ordering, only within your own org.

---

## 11. Retries

Defaults (production): 3 attempts, 1s→10s exponential, factor 2, randomized jitter. Off in dev unless `retries.enabledInDev: true`.

```ts
retry: {
  maxAttempts: 5,
  factor: 1.8,
  minTimeoutInMs: 500,
  maxTimeoutInMs: 30_000,
  randomize: true,
  outOfMemory: { machine: "large-1x" },
}
```

`catchError` controls per-error retry decision:

```ts
catchError: async ({ error, retryAt }) => {
  if (error instanceof BadRequestError)  return { skipRetrying: true };
  if (error instanceof RateLimited)      return { retryAt: error.resetAt };
  return undefined;                       // default policy
}
```

### Retry helpers (use anywhere in a task)

```ts
import { retry } from "@trigger.dev/sdk";

await retry.onThrow(async ({ attempt }) => doIt(), {
  maxAttempts: 3, factor: 2, minTimeoutInMs: 500, maxTimeoutInMs: 5000, randomize: true,
});

await retry.fetch("https://api.example.com", {
  retry: {
    byStatus: {
      "429": {
        strategy: "headers",
        limitHeader: "x-ratelimit-limit",
        remainingHeader: "x-ratelimit-remaining",
        resetHeader: "x-ratelimit-reset",
        resetFormat: "unix_timestamp_in_ms",
      },
      "500-599": { strategy: "backoff", maxAttempts: 10, factor: 2 },
    },
    timeout: { maxAttempts: 5, minTimeoutInMs: 500 },
  },
  timeoutInMs: 1000,
});
```

---

## 12. Errors

```ts
import { AbortTaskRunError, OutOfMemoryError } from "@trigger.dev/sdk";

throw new AbortTaskRunError("won't retry");   // marks FAILED, no further attempts
throw new OutOfMemoryError();                  // triggers retry.outOfMemory.machine if set
```

- Plain throws → retried per `retry` config.
- `AbortTaskRunError` → terminal, no retries.
- `OutOfMemoryError` (or detected V8/process OOM) → retry on larger machine if `retry.outOfMemory.machine` is set, else `CRASHED`.
- `TaskPayloadParsedError` (from `schemaTask`) → no retry.
- After-final-failure → `onFailure` runs.

---

## 13. Logger

```ts
import { logger } from "@trigger.dev/sdk";

logger.debug("msg", { key: "value" });
logger.log("msg", { key: "value" });
logger.info("msg", { key: "value" });
logger.warn("msg", { key: "value" });
logger.error("msg", { key: "value", err });

const result = await logger.trace("download-file", async (span) => {
  span.setAttribute("url", url);
  return await fetch(url);
});
```

`console.*` calls are auto-intercepted in production runs and shown in the run log. Disable via `disableConsoleInterceptor: true` in config. `logger` calls filtered by config `logLevel`.

OTel limits: 256 attributes/span, 131,072 char value max.

---

## 14. `usage`

```ts
import { usage } from "@trigger.dev/sdk";

const u = usage.getCurrent();
// { compute: { attempt: { costInCents, durationMs }, total: {...} },
//   baseCostInCents, totalCostInCents }

const { result, compute } = await usage.measure(async () => doStuff());
```

Wait time and inter-attempt time are excluded from compute cost.

---

## 15. Run Context (`ctx`)

```ts
interface RunContext {
  task: { id: string; filePath: string };  // exportName REMOVED in v4
  attempt: { number: number; startedAt: Date; backgroundWorkerId: string;
             backgroundWorkerTaskId: string };
             // id and status REMOVED in v4
  run: {
    id: string; tags: string[]; isTest: boolean; isReplay: boolean;
    createdAt: Date; startedAt: Date;
    idempotencyKey?: string; maxAttempts?: number;
    durationMs: number; costInCents: number; baseCostInCents: number;
    version?: string; maxDuration?: number; context?: any;
  };
  queue: { id: string; name: string };
  environment: {
    id: string; slug: string;
    type: "PRODUCTION" | "STAGING" | "DEVELOPMENT" | "PREVIEW";
    branchName?: string;
    git?: { commitSha?, commitMessage?, commitAuthorName?, commitRef?,
            dirty?, remoteUrl?, pullRequestNumber?, pullRequestTitle?, pullRequestState? };
  };
  organization: { id: string; slug: string; name: string };
  project:      { id: string; ref: string; slug: string; name: string };
  batch?:       { id: string };
  machine?:     { name: string; cpu: number; memory: number; centsPerMs: number };
}
```

`ctx` is a snapshot — values like `durationMs` are static at run start.

---

## 16. Run States and Management

States:

- Initial: `PENDING_VERSION`, `DELAYED`, `QUEUED`, `DEQUEUED`
- Active: `EXECUTING`, `WAITING` (don't count toward concurrency)
- Terminal: `COMPLETED`, `FAILED`, `CANCELED`, `TIMED_OUT`, `CRASHED`, `SYSTEM_FAILURE`, `EXPIRED`

Helpers on the run object: `isCompleted`, `isFailed`, `isQueued`, `isExecuting`, `isWaiting`, `isCanceled`, `isSuccess`.

```ts
import { configure, runs } from "@trigger.dev/sdk";

configure({ secretKey: process.env.TRIGGER_SECRET_KEY });   // optional if env set

// retrieve typed
const run = await runs.retrieve<typeof myTask>(runId);
run.payload; run.output; run.attempts; run.metadata; run.tags;
run.payloadPresignedUrl;          // for large data
run.outputPresignedUrl;
run.relatedRuns;                  // parent / root / children

// list (auto-paginates with for-await)
for await (const r of runs.list({
  status: ["QUEUED","EXECUTING","COMPLETED"],
  taskIdentifier: ["my-task"],
  tag: ["user_123"],
  schedule: "sched_...",
  isTest: false,
  version: ["20240313.1"],
  from: new Date("2024-04-01"),
  to: new Date(),
  period: "1d",
  limit: 25,                      // 10–100, default 25
})) {}

// single page
const page = await runs.list({ limit: 20 });
await page.getNextPage();

await runs.replay(runId);                      // re-run, LATEST version
await runs.cancel(runId);                      // cancel + children
await runs.reschedule(runId, { delay: "1h" }); // only DELAYED runs

// realtime subscription (server)
for await (const r of runs.subscribeToRun<typeof myTask>(runId)) { /* live */ }
for await (const r of runs.subscribeToRunsWithTag("user_123")) {}
for await (const r of runs.subscribeToBatch(batchId)) {}

for await (const part of runs.subscribeToRun(runId).withStreams<MyStreams>()) {
  if (part.type === "run") { /* run state */ }
  else { /* part.type is the stream key, part is data */ }
}
```

---

## 17. Versioning

- Versions: `YYYYMMDD.N` per environment, per day.
- `npx trigger.dev deploy` creates a new version. Dev auto-creates on relevant changes.
- A run **locks to the latest version when it enters `EXECUTING`** (not at trigger / queue / delay).
- `triggerAndWait` / `batchTriggerAndWait` lock children to the parent's version.
- Plain `trigger` / `batchTrigger` use latest.
- Retries keep the original version. **Replays use the latest deployed version** — use `runs.replay` to retry with bug fixes.

---

## 18. `auth` API and Tokens

```ts
import { auth } from "@trigger.dev/sdk";

await auth.createPublicToken({
  scopes: {
    read: {
      runs: ["run_..."] | true,
      tasks: ["my-task"] | true,
      tags: ["user_42"] | true,
      batch: ["batch_..."] | true,
    },
    trigger: { tasks: ["my-task"] },
    write:   { metadata: ["run_..."] },
  },
  expirationTime: "1hr",          // default 15min; supports "sec","min","hour","day","week","year", Unix ts, Date
});

await auth.createTriggerPublicToken("my-task");                              // single-use
await auth.createTriggerPublicToken(["t1","t2"]);
await auth.createTriggerPublicToken("my-task", { multipleUse: true, expirationTime: "24hr" });
```

Server config:

```ts
import { configure } from "@trigger.dev/sdk";
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY,
  baseURL: process.env.TRIGGER_API_URL,         // self-host / staging
  previewBranch: process.env.TRIGGER_PREVIEW_BRANCH,
});
```

Env vars: `TRIGGER_SECRET_KEY` (server, full access), `TRIGGER_API_URL` (override), `TRIGGER_ACCESS_TOKEN` (CI auth), `TRIGGER_PREVIEW_BRANCH`.

Secret key prefix selects environment: `tr_dev_*`, `tr_stg_*`, `tr_prod_*`.

---

## 19. Frontend Hooks (`@trigger.dev/react-hooks`)

```bash
npm i @trigger.dev/react-hooks
```

All hooks accept `{ accessToken, baseURL?, enabled?, id? }`.

```tsx
"use client";
import {
  useRealtimeRun,
  useRealtimeRunsWithTag,
  useRealtimeBatch,
  useRealtimeRunWithStreams,
  useRealtimeStream,                    // SDK ≥ 4.1.0 (typed stream defs)
  useTaskTrigger,
  useRealtimeTaskTrigger,
  useRealtimeTaskTriggerWithStreams,
  useBatchTrigger,
  useWaitToken,
  useInputStreamSend,
} from "@trigger.dev/react-hooks";
import type { myTask } from "@/trigger/myTask";
import { aiStream } from "@/trigger/streams";

const { run, error, isLoading } = useRealtimeRun<typeof myTask>(runId, {
  accessToken,
  onComplete: (run, err) => {},
  skipColumns: ["payload","output"],   // reduce payload size
});
const { runs } = useRealtimeRunsWithTag<typeof myTask>("user_123", { accessToken });
const { runs: batchRuns } = useRealtimeBatch(batchId, { accessToken });
const { parts } = useRealtimeStream(aiStream, runId, { accessToken, throttleInMs: 50, startIndex: 0, timeoutInSeconds: 300 });
const { submit, handle, isLoading } = useTaskTrigger<typeof myTask>("my-task", { accessToken: triggerToken });
const { submit, run, streams } = useRealtimeTaskTriggerWithStreams<typeof myTask, MyStreams>("my-task", { accessToken: triggerToken });
const { complete } = useWaitToken(tokenId, { accessToken: token.publicAccessToken });
const { send, isReady } = useInputStreamSend(approvalKey, runId, { accessToken });
```

Skippable columns: `payload, output, metadata, startedAt, delayUntil, queuedAt, expiredAt, completedAt, number, isTest, usageDurationMs, costInCents, baseCostInCents, ttl, payloadType, outputType, runTags, error`.

---

## 20. Streams

Backend (typed, v4 preferred):

```ts
// trigger/streams.ts
import { streams } from "@trigger.dev/sdk";
export const aiStream = streams.define<string>("ai-output");
```

```ts
// in a task
await aiStream.publish(runId, asyncIterable);    // or use metadata.stream
// or untyped: await metadata.stream("ai-output", asyncIterable);

// reading from another backend
const s = await aiStream.read(runId, { timeoutInSeconds: 300, startIndex: 0, signal });
for await (const chunk of s) { /* ... */ }
const s2 = await streams.read<string>(runId, "ai-output");
```

---

## 21. AI helpers (`@trigger.dev/sdk/ai`)

```ts
import { ai } from "@trigger.dev/sdk/ai";
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

const lookupTask = schemaTask({
  id: "lookup",
  schema: z.object({ q: z.string() }),
  run: async ({ q }) => ({ result: `found ${q}` }),
});

// Wraps a schemaTask as a Vercel AI SDK / agent tool — replaces deprecated v3 toolTask
const lookupTool = ai.tool(lookupTask);
```

Pairs with Vercel AI SDK `streamText` / `generateText` and Anthropic Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`). Add SDKs to `build.external` if their bundlers don't tree-shake.

---

## 22. `trigger.config.ts` — All Fields

```ts
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_...",                    // REQUIRED

  // discovery
  dirs: ["./trigger"],
  ignorePatterns: ["**/*.test.ts"],
  tsconfig: "./custom-tsconfig.json",

  // runtime defaults
  runtime: "node",                        // "node" | "node-22" | "bun"
  machine: "small-1x",                    // default for all tasks
  defaultMachine: "small-1x",             // alias
  maxDuration: 60,                        // default cap, sec
  ttl: "1h",                              // default queue TTL

  // logging
  logLevel: "info",                       // SDK logger level
  enableConsoleLogging: true,
  disableConsoleInterceptor: false,

  // process pooling
  processKeepAlive: { enabled: true, maxExecutionsPerProcess: 50, devMaxPoolSize: 25 },
  legacyDevProcessCwdBehaviour: false,
  extraCACerts: "./certs/ca.crt",

  // retries
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2, randomize: true },
  },

  // global lifecycle (every task)
  init?:      async ({ payload, ctx }) => {},      // deprecated → middleware
  onStart?:   async ({ payload, ctx }) => {},
  onSuccess?: async ({ payload, output, ctx }) => {},
  onFailure?: async ({ payload, error, ctx }) => {},

  // OpenTelemetry
  telemetry: {
    instrumentations: [/* OTel */],
    exporters: [/* OTLPTraceExporter */],
    logExporters: [/* OTLPLogExporter */],
    metricExporters: [/* OTLPMetricExporter */],
  },

  // build
  build: {
    external: ["sharp", "header-generator"],
    autoDetectExternal: true,             // default true
    keepNames: true,
    minify: false,
    jsx: { fragment: "Fragment", factory: "h", automatic: false },
    conditions: ["react-server"],
    extensions: [/* see Build Extensions */],
    esbuildPlugins: [/* see esbuildPlugin extension */],
  },
});
```

---

## 23. Build Extensions

All from `@trigger.dev/build/extensions/...`. Install: `npm i -D @trigger.dev/build`.

### `prismaExtension`

```ts
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

prismaExtension({ mode: "modern" });                                     // Prisma 6.16+ engineType=client, or Prisma 7
prismaExtension({ mode: "engine-only", version: "6.19.0", binaryTarget: "linux-arm64-openssl-3.0.x" });
prismaExtension({                                                         // Legacy (Prisma <6.16)
  mode: "legacy",
  schema: "prisma/schema.prisma",
  migrate: true,                          // run prisma migrate deploy
  typedSql: true,
  directUrlEnvVarName: "DATABASE_URL_UNPOOLED",
  version: "6.19.0",
  configFile: "prisma.config.ts",
});
```

### `syncEnvVars` and friends

```ts
import { syncEnvVars, syncVercelEnvVars, syncNeonEnvVars, syncSupabaseEnvVars }
  from "@trigger.dev/build/extensions/core";

syncEnvVars(async (ctx) => {
  // ctx.environment, ctx.projectRef, ctx.env
  return [{ name: "SECRET_KEY", value: "..." }];
  // or: return { SECRET_KEY: "..." };
});

syncVercelEnvVars();        // env: VERCEL_ACCESS_TOKEN, VERCEL_PROJECT_ID, optional VERCEL_TEAM_ID
syncNeonEnvVars();          // emits DATABASE_URL, POSTGRES_URL, prisma-friendly variants
syncSupabaseEnvVars();      // uses Supabase Branching
```

Pushed at deploy time only — does NOT affect `dev`.

### `additionalFiles` / `additionalPackages`

```ts
import { additionalFiles, additionalPackages } from "@trigger.dev/build/extensions/core";

additionalFiles({ files: ["./assets/**", "wrangler/wrangler.toml"] });   // dev + deploy
additionalPackages({ packages: ["wrangler@3.78.0"] });                   // deploy-only; pin versions
```

### `esbuildPlugin`

```ts
import { esbuildPlugin } from "@trigger.dev/build/extensions";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";

esbuildPlugin(
  sentryEsbuildPlugin({ org, project, authToken }),
  { placement: "last", target: "deploy" },     // placement: "first" | "last", target: "dev" | "deploy"
);
```

### `ffmpeg`

```ts
import { ffmpeg } from "@trigger.dev/build/extensions/core";

ffmpeg();                       // installs Debian package
ffmpeg({ version: "7" });       // static build of 7.x
```

Sets `FFMPEG_PATH`, `FFPROBE_PATH`. Add `"fluent-ffmpeg"` to `build.external`.

### `audioWaveform`

```ts
import { audioWaveform } from "@trigger.dev/build/extensions/audioWaveform";
audioWaveform();                // BBC audiowaveform v1.1.0
```

### `puppeteer`

```ts
import { puppeteer } from "@trigger.dev/build/extensions/puppeteer";
puppeteer();
// Set env var in dashboard: PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
```

### `playwright`

```ts
import { playwright } from "@trigger.dev/build/extensions/playwright";

playwright({
  browsers: ["chromium"],       // also "firefox", "webkit"
  headless: true,               // false adds Xvfb
  version: "1.46.0",            // optional, auto-detected
});
```

Sets `PLAYWRIGHT_BROWSERS_PATH`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`, `PLAYWRIGHT_SKIP_BROWSER_VALIDATION`, `DISPLAY`.

### `lightpanda`

```ts
import { lightpanda } from "@trigger.dev/build/extensions/lightpanda";
lightpanda({ version: "latest", disableTelemetry: false });
```

### `aptGet`

```ts
import { aptGet } from "@trigger.dev/build/extensions/core";
aptGet({ packages: ["ffmpeg", "imagemagick=8:6.9.11.60+dfsg-1.6+deb12u3"] });   // name=version pins
```

---

## 24. CLI Commands

All work as `npx trigger.dev@latest <cmd>` (or `pnpm dlx`, `yarn dlx`).

### Common flags

| Flag | Purpose |
|---|---|
| `--config, -c` | Path to `trigger.config.ts` |
| `--project-ref, -p` | Project ref (required without config) |
| `--env-file` | Load env from file |
| `--profile` | Login profile name (default `"default"`) |
| `--api-url, -a` | Override API URL (env: `TRIGGER_API_URL`) |
| `--log-level, -l` | `debug \| info \| log \| warn \| error \| none` |
| `--skip-telemetry` | env: `TRIGGER_TELEMETRY_DISABLED` |
| `--skip-update-check` | |
| `--help, -h` / `--version, -v` | |

### Per-command

```bash
init                                       # bootstrap
dev [--analyze]                            # local dev
deploy [-e prod|staging|preview] [-b branch] [--dry-run] [--skip-promotion] [--skip-sync-env-vars] [--local-build]
promote <version>                          # promote a deployed version to current
login | logout [--profile <name>]
whoami
list-profiles
switch <name>
update                                     # bumps @trigger.dev/* deps
```

CI: set `TRIGGER_ACCESS_TOKEN` (and `TRIGGER_API_URL` for self-host) for non-interactive auth.

---

## 25. Environment Variables

Types: `DEVELOPMENT`, `STAGING`, `PRODUCTION`, `PREVIEW`. Selected by secret key prefix.

Local dev auto-loads (in order): `.env`, `.env.development`, `.env.local`, `.env.development.local`, `dev.vars`. (`.env.production` is **not** auto-loaded — use `syncEnvVars` + dotenvx.)

```ts
import { envvars } from "@trigger.dev/sdk";

await envvars.list();
await envvars.retrieve("API_KEY");
await envvars.create({ name, value });
await envvars.update(name, { value });
await envvars.del(name);
await envvars.upload({ variables: parsed, override: false });
```

Secrets are write-only after creation. Don't store per-tenant secrets in env vars; fetch at runtime from your secret store keyed by `payload.tenantId`.

---

## 26. Machines

| Preset | vCPU | Memory | Disk |
|---|---|---|---|
| `micro` | 0.25 | 0.25 GB | 10 GB |
| `small-1x` (default) | 0.5 | 0.5 GB | 10 GB |
| `small-2x` | 1 | 1 GB | 10 GB |
| `medium-1x` | 1 | 2 GB | 10 GB |
| `medium-2x` | 2 | 4 GB | 10 GB |
| `large-1x` | 4 | 8 GB | 10 GB |
| `large-2x` | 8 | 16 GB | 10 GB |

Compute pricing scales linearly: micro `$0.0000169/sec` → large-2x `$0.0006800/sec` + `$0.000025` per run invocation.

---

## 27. Limits

| Item | Limit |
|---|---|
| Single trigger payload | 3 MB |
| Batch item payload | 3 MB (SDK ≥ 4.3.1) |
| Task output | 10 MB (presigned URL above ~512 KB) |
| Batch size | 1,000 items (≥ 4.3.1; 500 prior) |
| I/O packet length | 128 KB (hardcoded) |
| Tags per run | 10 |
| Tag length | 1–128 chars |
| Metadata size | 256 KB |
| `idempotencyKeyTTL` default | 30 days |
| Run TTL hard cap (cloud) | 14 days |
| `maxDuration` minimum | 5 seconds |
| `maxDuration` measures | CPU time only — waits don't count |
| API request rate | 1,500/min |
| Public token default expiry | 15 minutes |
| Concurrency override range | 0–100,000 |
| OTel attrs/span | 256 |
| OTel attr value max | 131,072 chars |

Tier-dependent (see https://trigger.dev/pricing for current values):

| Tier | Concurrency | Log retention | Schedules | Realtime conns |
|---|---|---|---|---|
| Free | 20 | 1 day | 10 | 10 |
| Hobby | 50 | 7 days | 100 | 50 |
| Pro | 200+ ($10/50) | 30 days | 1000+ ($10/1k) | 500+ |
| Enterprise | custom | custom | custom | custom |

Batch trigger token bucket — Free: 1,200 / 100 per 10s; Hobby/Pro: 5,000 / 500 per 5s.

---

## 28. Self-Hosting

Apache 2.0 licensed (`triggerdotdev/trigger.dev` → `hosting/docker`). Webapp: 3+ vCPU, 6+ GB RAM. Worker: 4+ vCPU, 8+ GB RAM. Scale workers horizontally.

```bash
git clone --depth=1 https://github.com/triggerdotdev/trigger.dev
cd trigger.dev/hosting/docker
cp .env.example .env

(cd webapp && docker compose up -d)
(cd worker && docker compose up -d)
# or combined:
docker compose -f webapp/docker-compose.yml -f worker/docker-compose.yml up -d
```

Default ports: webapp `:8030`, MinIO API `:9000`, MinIO dashboard `:9001`, registry `:5000`.

Required envs: registry creds, MinIO creds, `EMAIL_TRANSPORT` (`resend|smtp|aws-ses`), optional `WHITELISTED_EMAILS` (regex), `TRIGGER_WORKER_TOKEN` (from webapp bootstrap), `TRIGGER_IMAGE_TAG` (pin to CLI version, not `latest`).

Caveats:

- Docker provider does NOT enforce per-task resource limits.
- Worker has Docker socket access; task containers share host network.
- Multi-worker self-host not yet supported.
- 128 KB I/O packet limit is hardcoded — not configurable.

---

## 29. v2 → v4 (and v3 → v4) Migration Cheatsheet

### v2 (now removed) — flag if user pastes any of these

| v2 pattern | v4 replacement |
|---|---|
| `new TriggerClient({ id, apiKey })` | none — config goes in `trigger.config.ts` |
| `client.defineJob({ id, name, version, trigger: eventTrigger(...), run })` | `task({ id, run })` |
| `eventTrigger({ name })` + `client.sendEvent` | `task` + `tasks.trigger("id", payload)` |
| `cronTrigger({ cron })` | `schedules.task({ cron, ... })` |
| `io.runTask("step", async () => {...})` | nested `task` + `triggerAndWait`, or just inline (v4 tasks ARE the unit) |
| `@trigger.dev/openai`, `@trigger.dev/resend`, etc. | direct vendor SDKs (no integration packages) |
| Serverless 15-min execution cap | gone — durable, checkpointed runs |

### v3 → v4 deltas

| v3 | v4 |
|---|---|
| `@trigger.dev/sdk/v3` | `@trigger.dev/sdk` |
| `handleError` | `catchError` |
| `init` task option | `middleware` + `locals` |
| `toolTask` | `ai.tool(schemaTask)` |
| Queue created on trigger | `queue({ name, concurrencyLimit })` first |
| `triggerAndWait` returned `T` | `Result<T>` (`if (r.ok)` or `.unwrap()`) |
| `batchTrigger` returned runs | batch handle; use `batch.retrieve()` |
| Hooks: positional args | single object param |
| `ctx.attempt.id`, `.status` | removed (only `attempt.number`) |
| `ctx.task.exportName` | removed |
| OTel | bumped to 0.203.0 — update custom exporters |
| New v4 hooks | `onStartAttempt`, `onWait`, `onResume`, `onComplete`, `onCancel` |

What stayed: core task model, run signature, payload-based triggering, ctx fundamentals, schedules.task shape.

---

## 30. Doc URLs

Verify against the live docs:

- Quick start: https://trigger.dev/docs/quick-start
- Manual setup: https://trigger.dev/docs/manual-setup
- Config file: https://trigger.dev/docs/config/config-file
- Tasks overview: https://trigger.dev/docs/tasks/overview
- schemaTask: https://trigger.dev/docs/tasks/schemaTask
- Scheduled: https://trigger.dev/docs/tasks/scheduled
- Triggering: https://trigger.dev/docs/triggering
- Runs / states: https://trigger.dev/docs/runs
- Run metadata: https://trigger.dev/docs/runs/metadata
- maxDuration: https://trigger.dev/docs/runs/max-duration
- Errors & retrying: https://trigger.dev/docs/errors-retrying
- Wait functions: https://trigger.dev/docs/wait, /wait-for, /wait-until, /wait-for-token
- Idempotency: https://trigger.dev/docs/idempotency
- Tags: https://trigger.dev/docs/tags
- Queues / concurrency: https://trigger.dev/docs/queue-concurrency
- Machines: https://trigger.dev/docs/machines
- Context: https://trigger.dev/docs/context
- Logging: https://trigger.dev/docs/logging
- Realtime: https://trigger.dev/docs/realtime
- Realtime react hooks: https://trigger.dev/docs/realtime/react-hooks/subscribe, /triggering, /streams
- Streams: https://trigger.dev/docs/realtime/streams
- Frontend overview: https://trigger.dev/docs/frontend/overview
- Versioning: https://trigger.dev/docs/versioning
- Limits: https://trigger.dev/docs/limits
- Pricing: https://trigger.dev/pricing
- Build extensions: https://trigger.dev/docs/config/extensions/* (one page per extension)
- CLI: https://trigger.dev/docs/cli-dev, /cli-deploy, /cli-login-commands, /cli-promote-commands
- Self-host: https://trigger.dev/docs/self-hosting/overview, /docker
- Migration v3→v4: https://trigger.dev/docs/upgrade-to-v4
- v2 EOL: https://trigger.dev/blog/v2-end-of-life-announcement
- Building with AI / Claude Agent SDK: https://trigger.dev/docs/building-with-ai, /guides/ai-agents/claude-code-trigger
- Vercel AI SDK guide: https://trigger.dev/docs/guides/examples/vercel-ai-sdk
- Full doc index: https://trigger.dev/docs/llms.txt
