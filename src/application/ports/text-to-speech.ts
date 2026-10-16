import type { PcmAudio } from "../../domain/audio.js";
import type { VoiceGender } from "../../domain/guild-settings.js";

export interface TextToSpeech {
  synthesize(text: string, voice: VoiceGender, signal?: AbortSignal): Promise<PcmAudio>;
}
