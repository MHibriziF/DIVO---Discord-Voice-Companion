import Groq, { toFile } from "groq-sdk";
import type { SpeechToText } from "../../application/ports/speech-to-text.js";
import type { PcmAudio } from "../../domain/audio.js";
import { encodeWav } from "../audio/pcm.js";

export interface GroqSpeechToTextOptions {
  readonly model: string;
  /** ISO-639-1 code; undefined lets Whisper auto-detect. */
  readonly language: string | undefined;
  /** Words Whisper should expect, such as the bot's name, so it spells them right. */
  readonly vocabularyHint: string;
}

export class GroqSpeechToText implements SpeechToText {
  constructor(
    private readonly groq: Groq,
    private readonly options: GroqSpeechToTextOptions,
  ) {}

  async transcribe(audio: PcmAudio, signal?: AbortSignal): Promise<string> {
    const file = await toFile(encodeWav(audio), "utterance.wav", { type: "audio/wav" });
    const result = await this.groq.audio.transcriptions.create(
      {
        file,
        model: this.options.model,
        response_format: "json",
        temperature: 0,
        prompt: this.options.vocabularyHint,
        ...(this.options.language ? { language: this.options.language } : {}),
      },
      { signal },
    );
    return result.text;
  }
}
