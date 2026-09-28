import { describe, expect, it } from "vitest";
import {
  baseCreativeName,
  classifyRatio,
  labelledName,
  parseLabelledName,
  planCreatives,
  type DroppedFile,
} from "./creativeNames";

describe("classifyRatio", () => {
  it("reads 1:1 and 4:5 from pixels", () => {
    expect(classifyRatio(1080, 1080)).toBe("1:1");
    expect(classifyRatio(1080, 1350)).toBe("4:5");
  });

  it("tolerates a few pixels of export drift", () => {
    expect(classifyRatio(1082, 1352)).toBe("4:5");
    expect(classifyRatio(1080, 1078)).toBe("1:1");
  });

  it("refuses anything else rather than guessing", () => {
    expect(classifyRatio(1200, 800)).toBeNull();
    expect(classifyRatio(1080, 1920)).toBeNull();
    expect(classifyRatio(0, 0)).toBeNull();
  });
});

describe("baseCreativeName", () => {
  it("strips the extension and any size marker", () => {
    expect(baseCreativeName("spring-promo_4x5.jpg")).toBe("spring-promo");
    expect(baseCreativeName("spring-promo 1x1.png")).toBe("spring-promo");
    expect(baseCreativeName("spring-promo (4:5).jpg")).toBe("spring-promo");
    expect(baseCreativeName("spring-promo-1-1.mp4")).toBe("spring-promo");
    expect(baseCreativeName("spring-promo.jpg")).toBe("spring-promo");
  });

  it("leaves numbers that are not a size marker alone", () => {
    expect(baseCreativeName("roof 2024 v2.jpg")).toBe("roof 2024 v2");
    expect(baseCreativeName("14x5 deal.jpg")).toBe("14x5 deal");
  });

  it("falls back to the stem when the name was only a marker", () => {
    expect(baseCreativeName("1x1.jpg")).toBe("1x1");
  });
});

describe("labelled names", () => {
  it("round-trips", () => {
    const name = labelledName("spring-promo", "4:5", "JPG");
    expect(name).toBe("spring-promo 4:5.jpg");
    expect(parseLabelledName(name)).toEqual({ base: "spring-promo", ratio: "4:5" });
  });

  it("parses a video title with no extension", () => {
    expect(parseLabelledName("roof reveal 1:1")).toEqual({ base: "roof reveal", ratio: "1:1" });
  });

  it("ignores names without a label", () => {
    expect(parseLabelledName("untitled")).toBeNull();
    expect(parseLabelledName("1:1")).toBeNull();
  });
});

const img = (id: string, fileName: string, width: number, height: number): DroppedFile => ({
  id,
  fileName,
  kind: "image",
  width,
  height,
});

describe("planCreatives", () => {
  const none = { image: new Set<string>(), video: new Set<string>() };

  it("pairs the two sizes of one creative", () => {
    const plan = planCreatives(
      [img("a", "promo_1x1.jpg", 1080, 1080), img("b", "promo_4x5.jpg", 1080, 1350)],
      none,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].base).toBe("promo");
    expect(plan[0].missing).toEqual([]);
    expect(plan[0].files.map((f) => [f.name, f.status])).toEqual([
      ["promo 1:1.jpg", "ready"],
      ["promo 4:5.jpg", "ready"],
    ]);
  });

  it("pairs two files with the same name from different folders by their shape", () => {
    const plan = planCreatives(
      [img("a", "promo.jpg", 1080, 1350), img("b", "promo.jpg", 1080, 1080)],
      none,
    );
    expect(plan[0].files.map((f) => f.ratio)).toEqual(["1:1", "4:5"]);
    expect(plan[0].missing).toEqual([]);
  });

  it("flags a missing partner size without blocking", () => {
    const plan = planCreatives([img("a", "promo.jpg", 1080, 1080)], none);
    expect(plan[0].missing).toEqual(["4:5"]);
    expect(plan[0].files[0].status).toBe("ready");
  });

  it("refuses a file that is neither size", () => {
    const plan = planCreatives([img("a", "team.jpg", 1200, 800)], none);
    expect(plan[0].files[0].status).toBe("bad-ratio");
    expect(plan[0].missing).toEqual([]);
  });

  it("skips what Meta already has, matching regardless of case", () => {
    const plan = planCreatives([img("a", "Promo.jpg", 1080, 1080)], {
      image: new Set(["promo|1:1"]),
      video: new Set(),
    });
    expect(plan[0].files[0].status).toBe("duplicate");
    expect(plan[0].missing).toEqual(["4:5"]);
  });

  it("keeps images and videos of the same name apart", () => {
    const plan = planCreatives(
      [
        img("a", "promo.jpg", 1080, 1080),
        { id: "v", fileName: "promo.mp4", kind: "video", width: 1080, height: 1080 },
      ],
      { image: new Set(), video: new Set(["promo|1:1"]) },
    );
    expect(plan.map((g) => [g.kind, g.files[0].status])).toEqual([
      ["image", "ready"],
      ["video", "duplicate"],
    ]);
  });

  it("uploads only the first of two drops of the same size", () => {
    const plan = planCreatives(
      [img("a", "promo_1x1.jpg", 1080, 1080), img("b", "promo 1x1.png", 1080, 1080)],
      none,
    );
    expect(plan[0].files.map((f) => f.status)).toEqual(["ready", "clash"]);
  });

  it("refuses a file that is not an image or video", () => {
    const plan = planCreatives(
      [{ id: "x", fileName: "brief.pdf", kind: "other", width: 0, height: 0 }],
      none,
    );
    expect(plan[0].files[0].status).toBe("unsupported");
  });
});
