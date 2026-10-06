import { describe, it, expect } from "vitest";
import { factsBlock, toFacts } from "./clientFacts";

describe("toFacts", () => {
  it("prefers the tenant, then intake, then setup fields", () => {
    const f = toFacts({
      tenant: { name: "Willis Windows", niche: "Window cleaning", website_url: "https://williswindows.com" },
      answers: {
        contactName: "Chris Willis",
        addressCity: "Detroit",
        addressState: "MI",
        service1: "Window cleaning",
        service2: " ",
        service3: "Gutters",
        usp: "Pure water",
      },
      fields: { user_first_name: "Chris" },
    });
    expect(f).toEqual({
      businessName: "Willis Windows",
      trade: "Window cleaning",
      ownerFirstName: "Chris",
      ownerFullName: "Chris Willis",
      city: "Detroit",
      state: "MI",
      serviceArea: "",
      services: ["Window cleaning", "Gutters"],
      usp: "Pure water",
      website: "https://williswindows.com",
    });
  });

  it("works for a client with no intake form", () => {
    const f = toFacts({ tenant: { name: "AAG" }, answers: null, fields: { user_full_name: "Sam Lee" } });
    expect(f.businessName).toBe("AAG");
    expect(f.ownerFirstName).toBe("Sam");
    expect(f.services).toEqual([]);
  });
});

describe("factsBlock", () => {
  it("drops blank lines", () => {
    const block = factsBlock(toFacts({ tenant: { name: "AAG", niche: "Garage doors" }, answers: null, fields: null }));
    expect(block).toBe("Business: AAG\nTrade: Garage doors");
  });
});
