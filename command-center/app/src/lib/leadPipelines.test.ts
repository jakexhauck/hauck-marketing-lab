import { describe, it, expect } from "vitest";
import { resolveLeadPipeline } from "./leadPipelines";
import type { ApiPipelineSummary } from "./api";

function pipe(id: string, name: string): ApiPipelineSummary {
  return { id, name, stages: [] };
}

const SALES = pipe("6o9Gx6e0TXRFJdln5d01", "Sales");
const TRASH = pipe("TtKcHZeAtljinJik9kK5", "Trash");
const REVIEWS = pipe("R76ncRGrODiJuDJJTUWR", "Google Reviews");

describe("resolveLeadPipeline", () => {
  it("matches Sales by exact name", () => {
    expect(resolveLeadPipeline([REVIEWS, SALES, TRASH], "sales")?.id).toBe(
      "6o9Gx6e0TXRFJdln5d01",
    );
  });

  it("matches Trash by exact name, case-insensitively", () => {
    expect(
      resolveLeadPipeline([pipe("x", "TRASH"), SALES], "trash")?.id,
    ).toBe("x");
  });

  it("falls back to contains when there is no exact match", () => {
    const p = pipe("y", "Willis Sales Pipeline");
    expect(resolveLeadPipeline([REVIEWS, p], "sales")?.id).toBe("y");
  });

  it("falls back to the known id when name resolution fails", () => {
    const renamed = pipe("6o9Gx6e0TXRFJdln5d01", "Main Board");
    expect(resolveLeadPipeline([REVIEWS, renamed], "sales")?.id).toBe(
      "6o9Gx6e0TXRFJdln5d01",
    );
  });

  it("returns null when nothing matches", () => {
    expect(resolveLeadPipeline([REVIEWS], "trash")).toBeNull();
  });
});
