import type { PcmAudio } from "../../domain/audio.js";

export interface TextToSpeech {
  synthesize(text: string, signal?: AbortSignal): Promise<PcmAudio>;
}
