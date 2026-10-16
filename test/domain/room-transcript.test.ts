import { describe, expect, it } from "vitest";
import { RoomTranscript } from "../../src/domain/room-transcript.js";

const alice = { id: "1", displayName: "Alice" };

describe("RoomTranscript", () => {
  it("keeps only the newest entries", () => {
    const transcript = new RoomTranscript({ maxEntries: 2, maxAgeMs: 60_000 });
    transcript.add({ kind: "human", speaker: alice, text: "one", at: 1 });
    transcript.add({ kind: "human", speaker: alice, text: "two", at: 2 });
    transcript.add({ kind: "human", speaker: alice, text: "three", at: 3 });
    expect(transcript.recent(3).map((entry) => entry.text)).toEqual(["two", "three"]);
  });

  it("drops entries older than the max age", () => {
    const transcript = new RoomTranscript({ maxEntries: 10, maxAgeMs: 1_000 });
    transcript.add({ kind: "human", speaker: alice, text: "old", at: 0 });
    transcript.add({ kind: "human", speaker: alice, text: "new", at: 900 });
    expect(transcript.recent(1_500).map((entry) => entry.text)).toEqual(["new"]);
  });
});
