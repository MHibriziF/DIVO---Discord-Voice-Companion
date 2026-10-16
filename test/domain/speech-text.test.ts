import { describe, expect, it } from "vitest";
import { isNoiseTranscript, toSpeakableText } from "../../src/domain/speech-text.js";

describe("isNoiseTranscript", () => {
  it.each(["", ".", "Thank you.", "  you ", "Thanks for watching!"])("flags %j as noise", (text) => {
    expect(isNoiseTranscript(text)).toBe(true);
  });

  it("keeps real speech", () => {
    expect(isNoiseTranscript("Thank you Divo, that helped")).toBe(false);
  });
});

describe("toSpeakableText", () => {
  it("removes markdown and links", () => {
    expect(toSpeakableText("**Sure!** See [the docs](https://x.y) or https://example.com `now`")).toBe(
      "Sure! See the docs or now",
    );
  });
});
