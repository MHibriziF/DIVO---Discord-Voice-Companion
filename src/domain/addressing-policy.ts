export interface AddressingConfig {
  /** Bot name and aliases; multi-word aliases match adjacent words ("dee vo"). */
  readonly names: readonly string[];
  /** After the bot replies to someone, that person may keep talking to it without the name for this long. */
  readonly followUpWindowMs: number;
}

export type AddressingReason = "name" | "follow-up";

export interface HeardUtterance {
  readonly speakerId: string;
  readonly text: string;
  readonly at: number;
}

/** Decides whether an utterance was directed at the bot. */
export class AddressingPolicy {
  private readonly names: readonly string[];
  private lastReply: { speakerId: string; at: number } | undefined;

  constructor(private readonly config: AddressingConfig) {
    this.names = config.names.map((name) => normalize(name).replaceAll(" ", "")).filter(Boolean);
  }

  evaluate(utterance: HeardUtterance): AddressingReason | null {
    if (this.mentionsName(utterance.text)) return "name";
    if (
      this.lastReply?.speakerId === utterance.speakerId &&
      utterance.at - this.lastReply.at <= this.config.followUpWindowMs
    ) {
      return "follow-up";
    }
    return null;
  }

  recordReply(speakerId: string, at: number): void {
    this.lastReply = { speakerId, at };
  }

  private mentionsName(text: string): boolean {
    const words = normalize(text).split(" ").filter(Boolean);
    const candidates = [...words, ...words.slice(1).map((word, i) => `${words[i]}${word}`)];
    return candidates.some((candidate) => this.names.some((name) => isCloseMatch(candidate, name)));
  }
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Speech-to-text often misspells names, so allow one edit for names of 4+ letters. */
function isCloseMatch(word: string, name: string): boolean {
  if (word === name) return true;
  if (name.length < 4 || Math.abs(word.length - name.length) > 1) return false;
  return levenshtein(word, name) <= 1;
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length]!;
}
