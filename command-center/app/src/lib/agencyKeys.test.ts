import { describe, it, expect } from "vitest";
import {
  AGENCY_KEYS,
  KEY_GROUPS,
  LOCKED_KEYS,
  LOCK_REASON,
  groupedKeys,
  isLocked,
  keyStatus,
  pendingKeys,
  registryKeyNames,
} from "./agencyKeys";
import type { AgencySecretRow } from "./secretsApi";

function row(over: Partial<AgencySecretRow>): AgencySecretRow {
  return {
    name: "X",
    usedBy: [],
    optional: false,
    inDoppler: false,
    inRuntime: false,
    masked: null,
    drift: null,
    ...over,
  };
}

describe("the catalogue and the registry agree", () => {
  // The whole point of the catalogue is that it is the SAME set of keys seen a
  // different way. A key in one and not the other means a credential either
  // vanishes off the screen or appears with no group, and both go unnoticed.
  it("files every Cloudflare-homed credential the registry declares", () => {
    const catalogued = new Set(AGENCY_KEYS.map((k) => k.name));
    const missing = registryKeyNames().filter((n) => !catalogued.has(n));
    expect(missing).toEqual([]);
  });

  it("invents no key the registry has never heard of", () => {
    const declared = new Set(registryKeyNames());
    const invented = AGENCY_KEYS.filter((k) => !declared.has(k.name)).map((k) => k.name);
    expect(invented).toEqual([]);
  });

  it("lists each key exactly once", () => {
    const names = AGENCY_KEYS.map((k) => k.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it("puts every key in a group that exists", () => {
    const groups = new Set(KEY_GROUPS.map((g) => g.id));
    const orphans = AGENCY_KEYS.filter((k) => !groups.has(k.group)).map((k) => k.name);
    expect(orphans).toEqual([]);
  });
});

describe("entry modes", () => {
  it("gives every generated key a generator", () => {
    const bad = AGENCY_KEYS.filter((k) => k.entry === "generate" && !k.generator);
    expect(bad).toEqual([]);
  });

  it("gives every generated key its consequence in writing", () => {
    // A Generate button with no warning is how SESSION_SECRET gets rotated on a
    // Tuesday afternoon and signs every client out.
    const bad = AGENCY_KEYS.filter((k) => k.entry === "generate" && !k.warning).map((k) => k.name);
    expect(bad).toEqual([]);
  });

  it("pairs the VAPID halves in both directions", () => {
    const pub = AGENCY_KEYS.find((k) => k.name === "VAPID_PUBLIC_KEY");
    const priv = AGENCY_KEYS.find((k) => k.name === "VAPID_PRIVATE_KEY");
    expect(pub?.pairedWith).toBe("VAPID_PRIVATE_KEY");
    expect(priv?.pairedWith).toBe("VAPID_PUBLIC_KEY");
  });

  it("explains every lock", () => {
    const unexplained = LOCKED_KEYS.filter((n) => !LOCK_REASON[n]);
    expect(unexplained).toEqual([]);
  });

  it("locks the keys that grant this page its own power", () => {
    // Regression guard. Any of these becoming editable means the panel can
    // revoke its own access or widen it, so the list is asserted explicitly
    // rather than trusted to stay right.
    expect(isLocked("CF_DEPLOY_TOKEN")).toBe(true);
    expect(isLocked("DOPPLER_TOKEN")).toBe(true);
    expect(isLocked("DOPPLER_WRITE_TOKEN")).toBe(true);
    expect(isLocked("SUPABASE_SERVICE_ROLE_KEY")).toBe(true);
    expect(isLocked("META_SYSTEM_USER_TOKEN")).toBe(false);
  });
});

describe("keyStatus", () => {
  it("is missing when neither side has it", () => {
    expect(keyStatus(row({}))).toBe("missing");
  });

  it("is pending when Doppler has it and the deploy does not", () => {
    expect(keyStatus(row({ inDoppler: true }))).toBe("pending");
  });

  it("is pending when the two hold different values", () => {
    expect(keyStatus(row({ inDoppler: true, inRuntime: true, drift: true }))).toBe("pending");
  });

  it("is live when both agree", () => {
    expect(keyStatus(row({ inDoppler: true, inRuntime: true, drift: false }))).toBe("live");
  });

  it("is live when the deploy has it and there is nothing to compare against", () => {
    // drift null with a runtime value: bound by hand, before Doppler knew. It is
    // serving, so calling it pending would send you to redeploy for nothing.
    expect(keyStatus(row({ inRuntime: true, drift: null }))).toBe("live");
  });
});

describe("pendingKeys", () => {
  it("counts only what an Apply would actually change", () => {
    const rows = [
      row({ name: "A", inDoppler: true }),
      row({ name: "B", inDoppler: true, inRuntime: true, drift: false }),
      row({ name: "C", inDoppler: true, inRuntime: true, drift: true }),
      row({ name: "D" }),
    ];
    expect(pendingKeys(rows).map((r) => r.name)).toEqual(["A", "C"]);
  });
});

describe("groupedKeys", () => {
  it("keeps group order and drops empty groups", () => {
    const out = groupedKeys([]);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((g) => g.keys.length > 0)).toBe(true);
    const ids = out.map((g) => g.group.id);
    expect(ids).toEqual([...ids].sort((a, b) =>
      KEY_GROUPS.findIndex((g) => g.id === a) - KEY_GROUPS.findIndex((g) => g.id === b),
    ));
  });

  it("shows a key the server reports that the catalogue does not know", () => {
    const out = groupedKeys([row({ name: "SOMETHING_NEW", inDoppler: true })]);
    const unused = out.find((g) => g.group.id === "unused");
    expect(unused?.keys.some((k) => k.def.name === "SOMETHING_NEW")).toBe(true);
  });

  it("joins each key to its live row", () => {
    const out = groupedKeys([row({ name: "RESEND_API_KEY", inDoppler: true, inRuntime: true, drift: false })]);
    const email = out.find((g) => g.group.id === "email");
    const resend = email?.keys.find((k) => k.def.name === "RESEND_API_KEY");
    expect(resend?.row?.inRuntime).toBe(true);
    // A key with no row yet is null rather than absent, so the panel can still
    // render its help text and its Generate button before anything is set.
    const notify = email?.keys.find((k) => k.def.name === "NOTIFY_FROM");
    expect(notify?.row).toBeNull();
  });
});
