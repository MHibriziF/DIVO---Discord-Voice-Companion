export interface TranscribedSegment {
  readonly text: string;
  /** Whisper's estimate (0-1) that the segment contains no speech at all. */
  readonly noSpeechProbability: number;
}

export interface SpeechFilterResult {
  readonly text: string;
  readonly dropped: readonly TranscribedSegment[];
}

/**
 * Whisper invents text ("Thank you.", "Thanks for watching!") from silence, coughs, and background noise.
 * Drops segments Whisper itself believes are not speech, and results too short to be words.
 */
export function filterSpeech(
  segments: readonly TranscribedSegment[],
  maxNoSpeechProbability: number,
): SpeechFilterResult {
  const kept = segments.filter((segment) => segment.noSpeechProbability <= maxNoSpeechProbability);
  const dropped = segments.filter((segment) => !kept.includes(segment));
  const text = kept
    .map((segment) => segment.text.trim())
    .join(" ")
    .trim();
  const letters = text.replace(/[^\p{L}\p{N}]/gu, "").length;
  return { text: letters >= 2 ? text : "", dropped };
}

/** Strips formatting that sounds wrong when read aloud. */
export function toSpeakableText(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
