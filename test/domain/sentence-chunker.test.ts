import { describe, expect, it } from "vitest";
import { SentenceChunker } from "../../src/domain/sentence-chunker.js";

function chunkAll(tokens: string[]): string[] {
  const chunker = new SentenceChunker();
  const out = tokens.flatMap((token) => chunker.push(token));
  const rest = chunker.flush();
  return rest ? [...out, rest] : out;
}

describe("SentenceChunker", () => {
  it("emits sentences as soon as they are complete", () => {
    const chunker = new SentenceChunker();
    expect(chunker.push("Hello there, my friend")).toEqual([]);
    expect(chunker.push(". How are")).toEqual(["Hello there, my friend."]);
    expect(chunker.push(" you?")).toEqual([]);
    expect(chunker.flush()).toBe("How are you?");
  });

  it("merges very short sentences with the next one", () => {
    expect(chunkAll(["Oh! ", "That is a great question. ", "Let me think."])).toEqual([
      "Oh! That is a great question.",
      "Let me think.",
    ]);
  });

  it("does not split decimals", () => {
    expect(chunkAll(["The answer is 3.5 meters long. Okay then."])).toEqual([
      "The answer is 3.5 meters long.",
      "Okay then.",
    ]);
  });
});
