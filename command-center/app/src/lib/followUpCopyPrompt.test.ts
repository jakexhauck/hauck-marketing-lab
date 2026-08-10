import { describe, it, expect } from "vitest";
import { emptyFollowupPage, PAGE_TYPES } from "../../functions/lib/followupPages";
import { buildCopyPrompt, parseVariations, promptForDraft } from "./followUpCopyPrompt";

const base = {
  clientName: "Willis Windows",
  niche: "Window cleaning",
  pageType: "objection-killer" as const,
  appointmentType: "Phone estimate",
  notes: "",
};

describe("buildCopyPrompt", () => {
  it("carries the client, the trade and the angle", () => {
    const p = buildCopyPrompt(base);
    expect(p).toContain("Willis Windows");
    expect(p).toContain("Window cleaning");
    expect(p).toContain("Objection killer");
  });

  it("survives a client with no trade recorded rather than inventing one", () => {
    const p = buildCopyPrompt({ ...base, niche: "  " });
    expect(p).toContain("a local home services business");
  });

  it("includes the appointment and the operator's steer only when given", () => {
    const bare = buildCopyPrompt({ ...base, appointmentType: "", notes: "" });
    expect(bare).not.toContain("What they are being booked into");
    expect(bare).not.toContain("Extra direction");

    const full = buildCopyPrompt({ ...base, notes: "mention the $100 off" });
    expect(full).toContain("Phone estimate");
    expect(full).toContain("mention the $100 off");
  });

  it("states the rules that make the voice, every time", () => {
    for (const pageType of PAGE_TYPES) {
      const p = buildCopyPrompt({ ...base, pageType });
      expect(p, pageType).toContain("{{contact.first_name}}");
      expect(p, pageType).toContain("Never use an em dash");
      expect(p, pageType).toContain("ONE idea per message");
      // The link is appended after the slug step, so the copy must not carry one.
      expect(p, pageType).toContain("Do NOT write a link");
    }
  });

  it("asks for exactly the three keys the parser reads", () => {
    const p = buildCopyPrompt(base);
    expect(p).toContain('"variation_1"');
    expect(p).toContain('"variation_2"');
    expect(p).toContain('"variation_3"');
  });

  it("never writes an em dash into its own prompt", () => {
    for (const pageType of PAGE_TYPES) {
      expect(buildCopyPrompt({ ...base, pageType }), pageType).not.toContain("—");
    }
  });
});

describe("parseVariations", () => {
  const good = '{"variation_1":"one","variation_2":"two","variation_3":"three"}';

  it("reads bare JSON", () => {
    expect(parseVariations(good)).toEqual(["one", "two", "three"]);
  });

  it("survives the code fence the model sometimes adds anyway", () => {
    expect(parseVariations("```json\n" + good + "\n```")).toEqual(["one", "two", "three"]);
    expect(parseVariations("```\n" + good + "\n```")).toEqual(["one", "two", "three"]);
  });

  it("drops blank slots rather than rendering an empty card", () => {
    expect(
      parseVariations('{"variation_1":"one","variation_2":"   ","variation_3":"three"}'),
    ).toEqual(["one", "three"]);
  });

  it("returns nothing when the reply is not JSON at all", () => {
    expect(parseVariations("Sure! Here are three messages:")).toEqual([]);
    expect(parseVariations("")).toEqual([]);
    expect(parseVariations("[1,2,3]")).toEqual([]);
  });

  it("ignores a fourth variation, because three is the whole point", () => {
    expect(
      parseVariations(
        '{"variation_1":"a","variation_2":"b","variation_3":"c","variation_4":"d"}',
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("trims what it keeps", () => {
    expect(parseVariations('{"variation_1":"  padded  "}')).toEqual(["padded"]);
  });
});

describe("promptForDraft", () => {
  it("refuses to build a brief before an angle is picked", () => {
    const draft = emptyFollowupPage("t1");
    expect(promptForDraft(draft, "Willis Windows", "Window cleaning", "")).toBeNull();
  });

  it("builds one once the angle exists", () => {
    const draft = { ...emptyFollowupPage("t1"), pageType: "recent-job" as const };
    const p = promptForDraft(draft, "Willis Windows", "Window cleaning", "");
    expect(p).toContain("Recent job near them");
  });
});
