import { Readable } from "node:stream";
import {
  type AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  entersState,
  NoSubscriberBehavior,
  StreamType,
  type VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import type { Guild } from "discord.js";
import prism from "prism-media";
import type { Logger } from "../../application/ports/logger.js";
import type { VoiceChannel, VoiceChannelListener } from "../../application/ports/voice-channel.js";
import type { PcmAudio } from "../../domain/audio.js";
import type { Speaker } from "../../domain/speaker.js";
import { convertPcm, pcmFromBuffer, pcmToBuffer, type PcmFormat } from "../audio/pcm.js";

const DISCORD_FORMAT: PcmFormat = { sampleRate: 48_000, channels: 2 };
const OPUS_FRAME_SIZE = 960;

export interface VoiceCaptureOptions {
  /** Silence that ends an utterance. */
  readonly silenceMs: number;
  /** Long monologues are cut into pieces of at most this length. */
  readonly maxUtteranceMs: number;
  /** Format handed to speech-to-text. */
  readonly captureFormat: PcmFormat;
}

export class DiscordVoiceChannel implements VoiceChannel {
  private readonly player: AudioPlayer;
  private readonly capturing = new Set<string>();
  private listener: VoiceChannelListener | undefined;
  private destroyed = false;

  constructor(
    private readonly connection: VoiceConnection,
    private readonly guild: Guild,
    readonly channelId: string,
    private readonly options: VoiceCaptureOptions,
    private readonly logger: Logger,
  ) {
    this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    this.player.on("error", (error) => logger.warn("Audio player error", { error: error.message }));
    connection.subscribe(this.player);
    connection.on("error", (error) => logger.warn("Voice connection error", { error: error.message }));
    connection.on(VoiceConnectionStatus.Disconnected, () => void this.recoverOrDestroy());
    connection.on(VoiceConnectionStatus.Destroyed, () => this.handleDestroyed());
  }

  get guildId(): string {
    return this.guild.id;
  }

  listen(listener: VoiceChannelListener): void {
    this.listener = listener;
    const speaking = this.connection.receiver.speaking;
    speaking.on("start", (userId: string) => {
      const speaker = this.resolveSpeaker(userId);
      if (!speaker) return;
      listener.onSpeakingStart(speaker);
      this.capture(speaker);
    });
    speaking.on("end", (userId: string) => {
      const speaker = this.resolveSpeaker(userId);
      if (speaker) listener.onSpeakingEnd(speaker);
    });
  }

  play(audio: PcmAudio, signal: AbortSignal): Promise<void> {
    if (signal.aborted || this.destroyed) return Promise.resolve();
    const pcm = pcmToBuffer(convertPcm(audio, DISCORD_FORMAT));
    const resource = createAudioResource(Readable.from([pcm], { objectMode: false }), { inputType: StreamType.Raw });

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.player.off(AudioPlayerStatus.Idle, finish);
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        this.player.stop(true);
        finish();
      };
      this.player.on(AudioPlayerStatus.Idle, finish);
      signal.addEventListener("abort", onAbort, { once: true });
      this.player.play(resource);
    });
  }

  disconnect(): void {
    if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) this.connection.destroy();
  }

  private capture(speaker: Speaker): void {
    if (this.capturing.has(speaker.id) || this.destroyed) return;
    this.capturing.add(speaker.id);

    const opus = this.connection.receiver.subscribe(speaker.id, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: this.options.silenceMs },
    });
    const decoder = new prism.opus.Decoder({
      rate: DISCORD_FORMAT.sampleRate,
      channels: DISCORD_FORMAT.channels,
      frameSize: OPUS_FRAME_SIZE,
    });
    const maxBytes = (this.options.maxUtteranceMs / 1000) * DISCORD_FORMAT.sampleRate * DISCORD_FORMAT.channels * 2;
    const chunks: Buffer[] = [];
    let bytes = 0;

    opus.on("data", (packet: Buffer) => decoder.write(packet));
    opus.once("close", () => decoder.end());
    opus.on("error", (error) => this.logger.warn("Voice receive error", { userId: speaker.id, error: error.message }));
    decoder.on("error", (error) => this.logger.debug("Dropped corrupt opus packet", { error: error.message }));
    decoder.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      bytes += chunk.byteLength;
      if (bytes >= maxBytes) opus.destroy();
    });
    decoder.once("end", () => {
      this.capturing.delete(speaker.id);
      if (chunks.length > 0) {
        const audio = convertPcm(pcmFromBuffer(Buffer.concat(chunks), DISCORD_FORMAT), this.options.captureFormat);
        this.listener?.onUtterance({ speaker, audio, endedAt: Date.now() });
      }
      // A monologue cut at maxUtteranceMs is still going; keep listening without waiting for a new "start" event.
      if (this.connection.receiver.speaking.users.has(speaker.id)) this.capture(speaker);
    });
  }

  private resolveSpeaker(userId: string): Speaker | undefined {
    const member = this.guild.members.cache.get(userId);
    if (member?.user.bot) return undefined;
    return { id: userId, displayName: member?.displayName ?? "Someone" };
  }

  private async recoverOrDestroy(): Promise<void> {
    try {
      // Moving channels or a brief network drop: the connection reconnects on its own.
      await Promise.race([
        entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      this.disconnect();
    }
  }

  private handleDestroyed(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.player.stop(true);
    this.listener?.onDisconnected();
  }
}
