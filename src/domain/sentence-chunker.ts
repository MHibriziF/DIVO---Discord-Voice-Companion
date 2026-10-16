const SENTENCE_END = /[.!?…]+["')\]]*(?:\s+|$)|\n+/g;

/**
 * Turns a token stream into speakable sentences as early as possible,
 * so text-to-speech can start before the full reply has been generated.
 */
export class SentenceChunker {
  private buffer = "";

  constructor(private readonly minLength = 12) {}

  push(text: string): string[] {
    this.buffer += text;
    const sentences: string[] = [];
    let start = 0;
    for (const match of this.buffer.matchAll(SENTENCE_END)) {
      const end = match.index + match[0].length;
      if (end === this.buffer.length && !/\s$/.test(match[0])) break;
      const candidate = this.buffer.slice(start, end).trim();
      if (candidate.length >= this.minLength) {
        sentences.push(candidate);
        start = end;
      }
    }
    this.buffer = this.buffer.slice(start);
    return sentences;
  }

  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest.length > 0 ? rest : null;
  }
}
