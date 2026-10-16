/** Interleaved signed 16-bit PCM. */
export interface PcmAudio {
  readonly samples: Int16Array;
  readonly sampleRate: number;
  readonly channels: number;
}

export function audioDurationMs(audio: PcmAudio): number {
  return (audio.samples.length / audio.channels / audio.sampleRate) * 1000;
}
