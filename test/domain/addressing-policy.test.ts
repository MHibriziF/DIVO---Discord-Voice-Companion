import { describe, expect, it } from "vitest";
import { AddressingPolicy } from "../../src/domain/addressing-policy.js";

const policy = () => new AddressingPolicy({ names: ["Divo", "dee vo"], followUpWindowMs: 10_000 });

describe("AddressingPolicy", () => {
  it("detects the bot's name anywhere in the sentence", () => {
    expect(policy().evaluate({ speakerId: "a", text: "hey Divo, what's up?", at: 0 })).toBe("name");
    expect(policy().evaluate({ speakerId: "a", text: "What do you think, divo?", at: 0 })).toBe("name");
  });

  it("tolerates one-letter misspellings from speech-to-text", () => {
    expect(policy().evaluate({ speakerId: "a", text: "Diva can you hear me", at: 0 })).toBe("name");
    expect(policy().evaluate({ speakerId: "a", text: "Dívo hello", at: 0 })).toBe("name");
  });

  it("matches multi-word aliases across adjacent words", () => {
    expect(policy().evaluate({ speakerId: "a", text: "dee vo tell me a joke", at: 0 })).toBe("name");
  });

  it("ignores unrelated speech", () => {
    expect(policy().evaluate({ speakerId: "a", text: "did you watch the video yesterday", at: 0 })).toBeNull();
    expect(policy().evaluate({ speakerId: "a", text: "I'm going to dinner", at: 0 })).toBeNull();
  });

  it("treats the same speaker's next words as a follow-up within the window", () => {
    const p = policy();
    p.recordReply("a", 1_000);
    expect(p.evaluate({ speakerId: "a", text: "and why is that", at: 5_000 })).toBe("follow-up");
    expect(p.evaluate({ speakerId: "b", text: "and why is that", at: 5_000 })).toBeNull();
    expect(p.evaluate({ speakerId: "a", text: "and why is that", at: 20_000 })).toBeNull();
  });
});
