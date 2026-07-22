import { describe, it, expect } from "vitest";
import { validateCreativeInput } from "./adCreatives";

// Pins the exact validation rules the Ad Library "New creative" POST endpoint
// relies on: required headline/primary text, length caps, status enum,
// optional mediaRef, default status.

describe("validateCreativeInput", () => {
  it("accepts a minimal valid body and trims whitespace", () => {
    const result = validateCreativeInput({
      headline: "  50% off windows  ",
      primaryText: "  Book this month and save.  ",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        mediaRef: undefined,
        headline: "50% off windows",
        primaryText: "Book this month and save.",
        status: "draft",
      },
    });
  });

  it("accepts an explicit status and a mediaRef", () => {
    const result = validateCreativeInput({
      headline: "Spring sale",
      primaryText: "Windows and doors.",
      status: "approved",
      mediaRef: "img_hash_123",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        mediaRef: "img_hash_123",
        headline: "Spring sale",
        primaryText: "Windows and doors.",
        status: "approved",
      },
    });
  });

  it("rejects a non-object body", () => {
    expect(validateCreativeInput(null)).toEqual({ ok: false, error: "invalid body" });
    expect(validateCreativeInput("nope")).toEqual({ ok: false, error: "invalid body" });
  });

  it("rejects a missing or blank headline", () => {
    expect(validateCreativeInput({ primaryText: "x" })).toEqual({
      ok: false,
      error: "headline is required",
    });
    expect(validateCreativeInput({ headline: "   ", primaryText: "x" })).toEqual({
      ok: false,
      error: "headline is required",
    });
  });

  it("rejects a headline over 300 characters", () => {
    const result = validateCreativeInput({
      headline: "a".repeat(301),
      primaryText: "x",
    });
    expect(result).toEqual({
      ok: false,
      error: "headline must be 300 characters or fewer",
    });
  });

  it("rejects a missing or blank primary text", () => {
    expect(validateCreativeInput({ headline: "x" })).toEqual({
      ok: false,
      error: "primary text is required",
    });
  });

  it("rejects primary text over 2000 characters", () => {
    const result = validateCreativeInput({
      headline: "x",
      primaryText: "a".repeat(2001),
    });
    expect(result).toEqual({
      ok: false,
      error: "primary text must be 2000 characters or fewer",
    });
  });

  it("rejects an invalid status", () => {
    const result = validateCreativeInput({
      headline: "x",
      primaryText: "y",
      status: "published",
    });
    expect(result).toEqual({
      ok: false,
      error: "status must be one of draft, approved, live",
    });
  });
});
