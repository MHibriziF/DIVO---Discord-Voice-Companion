export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface LanguageModel {
  /** Yields reply text as it is generated. */
  streamChat(messages: readonly ChatMessage[], signal: AbortSignal): AsyncIterable<string>;
}
