import { describe, it, expect } from "vitest";
import { buildEnvPayload, canDeploy, projectName, __viewDeployment } from "./cloudflarePages";
import type { Env } from "./env";

const env = (over: Partial<Env> = {}) => over as Env;

describe("buildEnvPayload: never blank a working secret", () => {
  // The whole reason this module is careful. Cloudflare's GET redacts secret
  // values, so anything that sends the read-back map straight home wipes every
  // secret it could not supply a value for. That is the "login unavailable"
  // outage, and it has happened more than once.
  it("omits a secret Cloudflare has that Doppler cannot supply", () => {
    const out = buildEnvPayload(
      {
        SESSION_SECRET: { type: "secret_text" },
        APP_PASSWORD: { type: "secret_text" },
      },
      { SESSION_SECRET: "real-value" },
      [],
    );

    expect(out.payload.SESSION_SECRET).toEqual({ type: "secret_text", value: "real-value" });
    expect(out.payload).not.toHaveProperty("APP_PASSWORD");
    expect(out.skipped).toEqual(["APP_PASSWORD"]);
  });

  it("never emits an empty-string secret", () => {
    const out = buildEnvPayload(
      { A: { type: "secret_text" }, B: { type: "secret_text" } },
      { A: "", B: "value" },
      [],
    );
    const empties = Object.entries(out.payload).filter(
      ([, v]) => v.type === "secret_text" && v.value === "",
    );
    expect(empties).toEqual([]);
    expect(out.skipped).toEqual(["A"]);
  });

  it("rewrites every secret it can, in one payload", () => {
    const out = buildEnvPayload(
      { A: { type: "secret_text" }, B: { type: "secret_text" } },
      { A: "1", B: "2" },
      [],
    );
    expect(out.set.sort()).toEqual(["A", "B"]);
    expect(Object.keys(out.payload).sort()).toEqual(["A", "B"]);
  });
});

describe("buildEnvPayload: plain build vars", () => {
  it("carries them through untouched so a full-map PATCH cannot drop them", () => {
    const out = buildEnvPayload(
      { NODE_VERSION: { type: "plain_text", value: "20" } },
      {},
      [],
    );
    expect(out.payload.NODE_VERSION).toEqual({ type: "plain_text", value: "20" });
    expect(out.preserved).toEqual(["NODE_VERSION"]);
  });

  it("prefers Cloudflare's own value over Doppler for a plain var", () => {
    // Build config is set in the Cloudflare dashboard and Doppler has no
    // opinion worth trusting over it.
    const out = buildEnvPayload(
      { NODE_VERSION: { type: "plain_text", value: "20" } },
      { NODE_VERSION: "18" },
      [],
    );
    expect(out.payload.NODE_VERSION.value).toBe("20");
  });
});

describe("buildEnvPayload: binding a new key", () => {
  it("adds one Cloudflare has never seen", () => {
    const out = buildEnvPayload({}, { HEALTH_CRON_SECRET: "abc" }, ["HEALTH_CRON_SECRET"]);
    expect(out.payload.HEALTH_CRON_SECRET).toEqual({ type: "secret_text", value: "abc" });
    expect(out.added).toEqual(["HEALTH_CRON_SECRET"]);
  });

  it("refuses to bind one Doppler has no value for", () => {
    // A blank secret reads as "configured" everywhere downstream and then fails
    // at the call site, which is worse than being visibly absent.
    const out = buildEnvPayload({}, {}, ["RESEND_API_KEY"]);
    expect(out.payload).not.toHaveProperty("RESEND_API_KEY");
    expect(out.refused).toEqual(["RESEND_API_KEY"]);
    expect(out.added).toEqual([]);
  });

  it("does not double-handle a key that already exists", () => {
    const out = buildEnvPayload({ A: { type: "secret_text" } }, { A: "1" }, ["A"]);
    expect(out.set).toEqual(["A"]);
    expect(out.added).toEqual([]);
  });

  it("binds only what it was asked to, never every key Doppler holds", () => {
    // Doppler also holds the account-wide Cloudflare token and the Supabase
    // access token, which are local-tooling credentials. Pushing everything
    // would put both into the app's runtime environment.
    const out = buildEnvPayload({}, { WANTED: "a", CLOUDFLARE_API_TOKEN: "b" }, ["WANTED"]);
    expect(Object.keys(out.payload)).toEqual(["WANTED"]);
  });
});

describe("canDeploy", () => {
  it("is false without the scoped token", () => {
    expect(canDeploy(env({ CLOUDFLARE_ACCOUNT_ID: "acct" }))).toBe(false);
  });

  it("is false without an account", () => {
    expect(canDeploy(env({ CF_DEPLOY_TOKEN: "tok" }))).toBe(false);
  });

  it("is true with both", () => {
    expect(canDeploy(env({ CF_DEPLOY_TOKEN: "tok", CLOUDFLARE_ACCOUNT_ID: "acct" }))).toBe(true);
  });
});

describe("projectName", () => {
  it("defaults to the name in wrangler.toml", () => {
    expect(projectName(env())).toBe("hauck-command-center");
  });

  it("takes an override", () => {
    expect(projectName(env({ CF_PAGES_PROJECT: "other" }))).toBe("other");
  });
});

describe("viewDeployment", () => {
  it("is live only when the deploy stage succeeded", () => {
    expect(
      __viewDeployment({ id: "d", latest_stage: { name: "deploy", status: "success" } }).state,
    ).toBe("live");
  });

  it("is not live when an earlier stage succeeded", () => {
    // A successful BUILD stage is not a live app. Reporting it as live would
    // flip the panel green while the old bundle is still being served.
    expect(
      __viewDeployment({ id: "d", latest_stage: { name: "build", status: "success" } }).state,
    ).toBe("building");
  });

  it("is failed on failure or cancellation", () => {
    expect(
      __viewDeployment({ id: "d", latest_stage: { name: "build", status: "failure" } }).state,
    ).toBe("failed");
    expect(
      __viewDeployment({ id: "d", latest_stage: { name: "deploy", status: "canceled" } }).state,
    ).toBe("failed");
  });

  it("is queued before the build starts", () => {
    expect(
      __viewDeployment({ id: "d", latest_stage: { name: "queued", status: "active" } }).state,
    ).toBe("queued");
  });

  it("survives a response with no stage at all", () => {
    expect(__viewDeployment({}).state).toBe("queued");
  });
});
