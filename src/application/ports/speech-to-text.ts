import type { PcmAudio } from "../../domain/audio.js";
import type { TranscribedSegment } from "../../domain/speech-text.js";

export interface SpeechToText {
  transcribe(audio: PcmAudio, signal?: AbortSignal): Promise<TranscribedSegment[]>;
}
