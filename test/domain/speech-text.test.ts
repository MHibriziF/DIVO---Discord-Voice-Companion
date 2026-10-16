import { describe, expect, it } from "vitest";
import { filterSpeech, toSpeakableText } from "../../src/domain/speech-text.js";

describe("filterSpeech", () => {
  it("keeps segments Whisper is confident contain speech", () => {
    const result = filterSpeech(
      [
        { text: " Hey Divo,", noSpeechProbability: 0.02 },
        { text: " what's up?", noSpeechProbability: 0.1 },
      ],
      0.6,
    );
    expect(result).toEqual({ text: "Hey Divo, what's up?", dropped: [] });
  });

  it("drops segments that are probably not speech", () => {
    const noise = { text: " Thank you.", noSpeechProbability: 0.85 };
    const result = filterSpeech([{ text: " Okay so", noSpeechProbability: 0.1 }, noise], 0.6);
    expect(result).toEqual({ text: "Okay so", dropped: [noise] });
  });

  it("keeps a real short thank you", () => {
    expect(filterSpeech([{ text: "Thank you.", noSpeechProbability: 0.05 }], 0.6).text).toBe("Thank you.");
  });

  it("returns nothing for results too short to be words", () => {
    expect(filterSpeech([{ text: " .", noSpeechProbability: 0 }], 0.6).text).toBe("");
    expect(filterSpeech([], 0.6).text).toBe("");
  });
});

describe("toSpeakableText", () => {
  it("removes markdown and links", () => {
    expect(toSpeakableText("**Sure!** See [the docs](https://x.y) or https://example.com `now`")).toBe(
      "Sure! See the docs or now",
    );
  });
});
