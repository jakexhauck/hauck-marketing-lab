import { describe, it, expect } from "vitest";
import {
  parseBuildPlan,
  groupByStatus,
  BUILD_STATUS_ORDER,
  type BuildItem,
} from "./builds";

const md = (fm: string, body = "# Body") => `---\n${fm}\n---\n\n${body}\n`;

describe("parseBuildPlan", () => {
  it("parses frontmatter into a BuildItem with derived urls", () => {
    const item = parseBuildPlan({
      slug: "autosave-onboarding",
      raw: md(
        [
          "type: plan",
          'title: "Autosave onboarding"',
          "status: building",
          "kind: feature",
          "issue: 42",
          'created: "2026-06-26T10:00:00.000Z"',
        ].join("\n"),
      ),
    });
    expect(item).toEqual({
      slug: "autosave-onboarding",
      title: "Autosave onboarding",
      status: "building",
      kind: "feature",
      issue: 42,
      issueUrl: "https://github.com/jakexhauck/hauck-marketing-lab/issues/42",
      planUrl:
        "https://github.com/jakexhauck/hauck-marketing-lab/blob/main/vault/Plans/Builds/autosave-onboarding.md",
      created: "2026-06-26T10:00:00.000Z",
    });
  });

  it("coerces an unknown status to idea and defaults missing fields", () => {
    const item = parseBuildPlan({ slug: "x", raw: md("title: X\nstatus: wat") });
    expect(item?.status).toBe("idea");
    expect(item?.kind).toBe("feature");
    expect(item?.issue).toBe(0);
    expect(item?.issueUrl).toBeNull();
  });

  it("falls back to the slug when title is missing", () => {
    const item = parseBuildPlan({ slug: "my-thing", raw: md("status: done") });
    expect(item?.title).toBe("my-thing");
  });

  it("returns null when there is no frontmatter block", () => {
    expect(parseBuildPlan({ slug: "x", raw: "# just a heading\n" })).toBeNull();
  });
});

describe("groupByStatus", () => {
  it("buckets items by status in declared column order", () => {
    const mk = (slug: string, status: BuildItem["status"]): BuildItem => ({
      slug,
      title: slug,
      status,
      kind: "feature",
      issue: 0,
      issueUrl: null,
      planUrl: "",
      created: "",
    });
    const grouped = groupByStatus([
      mk("a", "done"),
      mk("b", "idea"),
      mk("c", "done"),
    ]);
    expect(Object.keys(grouped)).toEqual(BUILD_STATUS_ORDER);
    expect(grouped.done.map((i) => i.slug)).toEqual(["a", "c"]);
    expect(grouped.idea.map((i) => i.slug)).toEqual(["b"]);
  });
});
