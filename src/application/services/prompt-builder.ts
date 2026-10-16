import type { Speaker } from "../../domain/speaker.js";
import type { TranscriptEntry } from "../../domain/room-transcript.js";
import type { ChatMessage } from "../ports/language-model.js";

export interface Persona {
  readonly name: string;
  /** Free-text personality, e.g. set by the server with /persona. */
  readonly personality: string | undefined;
}

export function buildChatMessages(
  persona: Persona,
  transcript: readonly TranscriptEntry[],
  addressedBy: Speaker,
): ChatMessage[] {
  const system = [
    `You are ${persona.name}, a friendly companion hanging out in a Discord voice channel with several people.`,
    persona.personality ? `Your personality, as set by this server: ${persona.personality}` : "",
    "Everything you write is read aloud by text-to-speech, so reply like you are talking:",
    "one to three short sentences, no markdown, lists, emoji, or links.",
    "User lines are speech-recognition transcripts prefixed with the speaker's name; they may contain recognition errors, so infer what was meant.",
    "Lines not meant for you are context; you can refer to them.",
    `Reply to the latest thing ${addressedBy.displayName} said to you.`,
  ]
    .filter(Boolean)
    .join(" ");

  const messages: ChatMessage[] = [];
  for (const entry of transcript) {
    const role = entry.kind === "human" ? "user" : "assistant";
    const content =
      entry.kind === "human"
        ? `${entry.speaker.displayName}: ${entry.text}`
        : entry.interrupted
          ? `${entry.text} [interrupted]`
          : entry.text;
    const previous = messages.at(-1);
    if (previous?.role === role) {
      messages[messages.length - 1] = { role, content: `${previous.content}\n${content}` };
    } else if (messages.length > 0 || role === "user") {
      messages.push({ role, content });
    }
  }

  return [{ role: "system", content: system }, ...messages];
}
