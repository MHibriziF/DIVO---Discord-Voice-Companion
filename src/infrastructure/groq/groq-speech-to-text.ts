import Groq, { toFile } from "groq-sdk";
import { z } from "zod";
import type { SpeechToText } from "../../application/ports/speech-to-text.js";
import type { PcmAudio } from "../../domain/audio.js";
import type { TranscribedSegment } from "../../domain/speech-text.js";
import { encodeWav } from "../audio/pcm.js";

export interface GroqSpeechToTextOptions {
  readonly model: string;
  /** ISO-639-1 code; undefined lets Whisper auto-detect. */
  readonly language: string | undefined;
  /** Words Whisper should expect, such as the bot's name, so it spells them right. */
  readonly vocabularyHint: string;
}

// The SDK types only declare `text`; verbose_json also returns per-segment confidence.
const verboseTranscription = z.object({
  text: z.string(),
  segments: z.array(z.object({ text: z.string(), no_speech_prob: z.number() })).optional(),
});

export class GroqSpeechToText implements SpeechToText {
  constructor(
    private readonly groq: Groq,
    private readonly options: GroqSpeechToTextOptions,
  ) {}

  async transcribe(audio: PcmAudio, signal?: AbortSignal): Promise<TranscribedSegment[]> {
    const file = await toFile(encodeWav(audio), "utterance.wav", { type: "audio/wav" });
    const response = await this.groq.audio.transcriptions.create(
      {
        file,
        model: this.options.model,
        response_format: "verbose_json",
        temperature: 0,
        prompt: this.options.vocabularyHint,
        ...(this.options.language ? { language: this.options.language } : {}),
      },
      { signal },
    );

    const result = verboseTranscription.parse(response);
    if (!result.segments) return [{ text: result.text, noSpeechProbability: 0 }];
    return result.segments.map((segment) => ({ text: segment.text, noSpeechProbability: segment.no_speech_prob }));
  }
}
