import { describe, expect, it } from "vitest";
import { INTAKE_FIELDS, INTAKE_STEPS, MIN_PASSWORD_LEN, PASSWORD_RULES, passwordProblems } from "./intake";
// ?raw pulls both files in as source text. Vite resolves them, so this needs no
// node:fs and no @types/node, which this project's tsconfig does not carry.
import FUNNEL from "../../public/funnel/intake.js?raw";
import STUB from "../../../../Client Onboarding Funnel/01-intake-form.html?raw";

// The funnel and the server must describe the same form.
//
// public/funnel/intake.js is the page the client actually fills in. It carries
// its own copy of the schema because it runs standalone on a GoHighLevel page,
// with no bundler and no import of this file. That copy is not checked by the
// compiler, and the server SILENTLY DROPS any answer key it does not recognise,
// so a typo there does not error: it quietly bins that client's answer.
//
// This existed as a shell snippet in the funnel README, which compared FIELD
// KEYS ONLY. The step blurbs drifted immediately: step 2 gained the A2P
// questions, its blurb was updated here, and the funnel kept telling clients the
// step was about "where you are based" until a screenshot caught it. A check
// that only covers part of the copy is a check that gives false confidence, so
// this one covers everything the two files both declare.

/** The array literal assigned to `name`, as raw source. */
function block(name: string): string {
  const start = FUNNEL.indexOf(`var ${name} = [`);
  expect(start, `${name} not found in the funnel script`).toBeGreaterThan(-1);
  const end = FUNNEL.indexOf("\n  ];", start);
  expect(end, `${name} is not terminated as expected`).toBeGreaterThan(start);
  return FUNNEL.slice(start, end);
}

function matchAll(source: string, re: RegExp): string[] {
  return [...source.matchAll(re)].map((m) => m[1]);
}

describe("the funnel script and the shared schema", () => {
  it("asks exactly the same questions, in the same order", () => {
    const funnelKeys = matchAll(block("FIELDS"), /key: "([a-zA-Z]+)"/g);
    expect(funnelKeys).toEqual(INTAKE_FIELDS.map((f) => f.key));
  });

  it("labels every question the same way", () => {
    const funnelLabels = matchAll(block("FIELDS"), /label: "([^"]+)"/g);
    expect(funnelLabels).toEqual(INTAKE_FIELDS.map((f) => f.label));
  });

  // The funnel declares ONE step this file does not: the review screen. Here it
  // is derived (REVIEW_STEP = LAST_INPUT_STEP + 1) because the server has no
  // screens; there it has to be a real entry with a heading of its own. So the
  // input steps must match exactly and the funnel gets exactly one extra.
  it("names and describes every input step the same way", () => {
    const steps = block("STEPS");
    const labels = matchAll(steps, /label: "([^"]+)"/g);
    const blurbs = matchAll(steps, /blurb: "([^"]+)"/g);

    expect(labels.slice(0, INTAKE_STEPS.length)).toEqual(
      INTAKE_STEPS.map((s) => s.label),
    );
    expect(blurbs.slice(0, INTAKE_STEPS.length)).toEqual(
      INTAKE_STEPS.map((s) => s.blurb),
    );
    expect(
      labels.length,
      "the funnel should carry the input steps plus a review screen, nothing more",
    ).toBe(INTAKE_STEPS.length + 1);
  });

  it("makes the same questions required", () => {
    const entries = block("FIELDS").split(/\n\s*\{ key: |\n\s*\{ key:/).slice(1);
    const funnelRequired = entries
      .map((e) => ({
        key: /^"([a-zA-Z]+)"/.exec(e.trim())?.[1] ?? "",
        required: /required: true/.test(e),
      }))
      .filter((e) => e.required)
      .map((e) => e.key);
    const schemaRequired = INTAKE_FIELDS.filter((f) => f.required).map((f) => f.key);
    expect(funnelRequired).toEqual(schemaRequired);
  });

  // The password rule is stated in the funnel's own words and enforced by the
  // server. If those two disagree, a client passes the form and is then bounced
  // by the API with a rule they were never shown, which is the worst version of
  // this to debug. So the funnel must carry the same number and the same three
  // lines, and its checker must reach the same verdict as ours.
  it("states the same password rule the server enforces", () => {
    expect(FUNNEL).toContain(`var MIN_PASSWORD_LEN = ${MIN_PASSWORD_LEN};`);
    for (const rule of PASSWORD_RULES) {
      expect(FUNNEL, `the funnel should say "${rule}"`).toContain(`<li>${rule}`);
    }
  });

  it("checks passwords the same way the server does", () => {
    // The funnel's checker, lifted out of the script and run against the same
    // inputs. A copy that drifted would disagree on one of these.
    const source = FUNNEL.slice(
      FUNNEL.indexOf("function passwordProblems(p)"),
      FUNNEL.indexOf("var STEPS = ["),
    );
    expect(source.length, "passwordProblems not found in the funnel").toBeGreaterThan(0);
    const funnelCheck = new Function(
      `var MIN_PASSWORD_LEN = ${MIN_PASSWORD_LEN}; ${source} return passwordProblems;`,
    )() as (p: string) => string[];

    for (const candidate of [
      "Roofing-Rules9",
      "roofing-rules9",
      "ROOFING-RULES9",
      "RoofingRulesNine",
      "Roofing-Rules",
      "Roof-9",
      "",
    ]) {
      expect(funnelCheck(candidate), `disagreed on "${candidate}"`).toEqual(
        passwordProblems(candidate),
      );
    }
  });

  // The stub in GHL is the one thing nobody can redeploy. If the URL it points
  // at ever moves, every client hits a page that renders nothing at all.
  it("is loaded by the stub the funnel actually pastes", () => {
    expect(STUB).toContain('id="hm-funnel-root"');
    expect(STUB).toContain("https://app.hauckmarketing.com/funnel/intake.js");
    // The full form must never come back into the pasted file: two copies is
    // the exact problem hosting the script solved.
    expect(STUB).not.toContain("var FIELDS");
  });
});
