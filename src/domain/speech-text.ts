/** Phrases Whisper tends to invent from silence or background noise. */
const NOISE_TRANSCRIPTS = new Set([
  "you",
  "thank you",
  "thanks",
  "thank you for watching",
  "thanks for watching",
  "bye",
  "subtitles by the amaraorg community",
]);

export function isNoiseTranscript(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.replace(/ /g, "").length < 2 || NOISE_TRANSCRIPTS.has(normalized);
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
