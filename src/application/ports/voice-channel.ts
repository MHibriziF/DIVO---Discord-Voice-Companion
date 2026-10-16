import type { PcmAudio } from "../../domain/audio.js";
import type { Speaker } from "../../domain/speaker.js";

export interface CapturedUtterance {
  readonly speaker: Speaker;
  readonly audio: PcmAudio;
  readonly endedAt: number;
}

export interface VoiceChannelListener {
  onUtterance(utterance: CapturedUtterance): void;
  onSpeakingStart(speaker: Speaker): void;
  onSpeakingEnd(speaker: Speaker): void;
  onDisconnected(): void;
}

/** A live connection to one voice channel: hears users, plays audio. */
export interface VoiceChannel {
  readonly guildId: string;
  readonly channelId: string;
  listen(listener: VoiceChannelListener): void;
  /** Resolves when playback finishes or the signal aborts it. */
  play(audio: PcmAudio, signal: AbortSignal): Promise<void>;
  disconnect(): void;
}

export interface VoiceChannelConnector {
  connect(guildId: string, channelId: string): Promise<VoiceChannel>;
}
