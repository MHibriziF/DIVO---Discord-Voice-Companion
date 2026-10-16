import { describe, expect, it } from "vitest";
import { buildChatMessages } from "../../src/application/services/prompt-builder.js";
import type { TranscriptEntry } from "../../src/domain/room-transcript.js";

const alice = { id: "1", displayName: "Alice" };
const bob = { id: "2", displayName: "Bob" };

describe("buildChatMessages", () => {
  it("labels speakers, merges consecutive user lines, and marks interruptions", () => {
    const transcript: TranscriptEntry[] = [
      { kind: "assistant", text: "Hi all", at: 0, interrupted: false },
      { kind: "human", speaker: alice, text: "Divo, pick a movie", at: 1 },
      { kind: "human", speaker: bob, text: "something scary", at: 2 },
      { kind: "assistant", text: "How about", at: 3, interrupted: true },
      { kind: "human", speaker: bob, text: "no wait, a comedy", at: 4 },
    ];

    const [system, ...rest] = buildChatMessages({ name: "Divo", personality: undefined }, transcript, bob);

    expect(system?.role).toBe("system");
    expect(system?.content).toContain("You are Divo");
    expect(system?.content).toContain("latest thing Bob said");
    expect(rest).toEqual([
      { role: "user", content: "Alice: Divo, pick a movie\nBob: something scary" },
      { role: "assistant", content: "How about [interrupted]" },
      { role: "user", content: "Bob: no wait, a comedy" },
    ]);
  });
});
