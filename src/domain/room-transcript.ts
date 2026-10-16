import type { Speaker } from "./speaker.js";

export type TranscriptEntry =
  | { readonly kind: "human"; readonly speaker: Speaker; readonly text: string; readonly at: number }
  | { readonly kind: "assistant"; readonly text: string; readonly at: number; readonly interrupted: boolean };

export interface RoomTranscriptLimits {
  readonly maxEntries: number;
  readonly maxAgeMs: number;
}

/** Rolling log of what was said in the channel, by humans and by the bot. */
export class RoomTranscript {
  private entries: TranscriptEntry[] = [];

  constructor(private readonly limits: RoomTranscriptLimits) {}

  add(entry: TranscriptEntry): void {
    this.entries.push(entry);
    this.prune(entry.at);
  }

  recent(now: number): readonly TranscriptEntry[] {
    this.prune(now);
    return [...this.entries];
  }

  private prune(now: number): void {
    const oldestAllowed = now - this.limits.maxAgeMs;
    this.entries = this.entries.filter((entry) => entry.at >= oldestAllowed).slice(-this.limits.maxEntries);
  }
}
