import type { PcmAudio } from "../../domain/audio.js";

export interface SpeechToText {
  transcribe(audio: PcmAudio, signal?: AbortSignal): Promise<string>;
}
