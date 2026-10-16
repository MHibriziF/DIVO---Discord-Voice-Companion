import { describe, expect, it } from "vitest";
import { InvalidPersonaError, isVoiceGender, normalizePersona } from "../../src/domain/guild-settings.js";

describe("normalizePersona", () => {
  it("collapses whitespace", () => {
    expect(normalizePersona("  A grumpy\n\n pirate  ")).toBe("A grumpy pirate");
  });

  it("rejects empty and overly long personas", () => {
    expect(() => normalizePersona("   ")).toThrow(InvalidPersonaError);
    expect(() => normalizePersona("x".repeat(1001))).toThrow(InvalidPersonaError);
  });
});

describe("isVoiceGender", () => {
  it("accepts only known voices", () => {
    expect(isVoiceGender("male")).toBe(true);
    expect(isVoiceGender("robot")).toBe(false);
  });
});
