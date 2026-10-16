import { AddressingPolicy, type AddressingConfig } from "../../domain/addressing-policy.js";
import { audioDurationMs } from "../../domain/audio.js";
import type { GuildSettings, VoiceGender } from "../../domain/guild-settings.js";
import { RoomTranscript, type RoomTranscriptLimits } from "../../domain/room-transcript.js";
import { SentenceChunker } from "../../domain/sentence-chunker.js";
import type { Speaker } from "../../domain/speaker.js";
import { filterSpeech, toSpeakableText } from "../../domain/speech-text.js";
import type { Clock } from "../ports/clock.js";
import type { LanguageModel } from "../ports/language-model.js";
import type { Logger } from "../ports/logger.js";
import type { SpeechToText } from "../ports/speech-to-text.js";
import type { TextToSpeech } from "../ports/text-to-speech.js";
import type { CapturedUtterance, VoiceChannel } from "../ports/voice-channel.js";
import { buildChatMessages } from "./prompt-builder.js";

export interface ConversationServices {
  readonly speechToText: SpeechToText;
  readonly languageModel: LanguageModel;
  readonly textToSpeech: TextToSpeech;
  readonly guildSettings: { get(guildId: string): Promise<GuildSettings> };
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface ConversationSettings {
  readonly botName: string;
  readonly addressing: AddressingConfig;
  readonly transcriptLimits: RoomTranscriptLimits;
  /** Utterances shorter than this (coughs, clicks) are not transcribed. */
  readonly minUtteranceMs: number;
  /** Transcribed segments Whisper rates above this no-speech probability are treated as noise. */
  readonly maxNoSpeechProbability: number;
  /** How long the person being answered must talk over the bot before it stops. */
  readonly bargeInAfterMs: number;
}

interface ActiveReply {
  readonly speakerId: string;
  readonly abort: AbortController;
}

/** One bot conversation in one voice channel: hear, transcribe, decide, reply, speak. */
export class VoiceConversation {
  private readonly addressing: AddressingPolicy;
  private readonly transcript: RoomTranscript;
  private readonly logger: Logger;
  private readonly bargeInTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private replyQueue: Promise<void> = Promise.resolve();
  private activeReply: ActiveReply | undefined;
  private stopped = false;

  constructor(
    private readonly channel: VoiceChannel,
    private readonly services: ConversationServices,
    private readonly settings: ConversationSettings,
    private readonly onStopped: () => void = () => {},
  ) {
    this.addressing = new AddressingPolicy(settings.addressing);
    this.transcript = new RoomTranscript(settings.transcriptLimits);
    this.logger = services.logger.child({ guildId: channel.guildId, channelId: channel.channelId });
  }

  get channelId(): string {
    return this.channel.channelId;
  }

  start(): void {
    this.channel.listen({
      onUtterance: (utterance) => void this.handleUtterance(utterance),
      onSpeakingStart: (speaker) => this.handleSpeakingStart(speaker),
      onSpeakingEnd: (speaker) => this.clearBargeInTimer(speaker.id),
      onDisconnected: () => this.stop(),
    });
    this.logger.info("Conversation started");
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.activeReply?.abort.abort();
    for (const timer of this.bargeInTimers.values()) clearTimeout(timer);
    this.bargeInTimers.clear();
    this.channel.disconnect();
    this.logger.info("Conversation stopped");
    this.onStopped();
  }

  private async handleUtterance({ speaker, audio, endedAt }: CapturedUtterance): Promise<void> {
    if (this.stopped || audioDurationMs(audio) < this.settings.minUtteranceMs) return;

    let segments;
    try {
      segments = await this.services.speechToText.transcribe(audio);
    } catch (error) {
      this.logger.warn("Transcription failed", { speaker: speaker.displayName, error });
      return;
    }
    const { text, dropped } = filterSpeech(segments, this.settings.maxNoSpeechProbability);
    if (dropped.length > 0) this.logger.debug("Dropped non-speech segments", { speaker: speaker.displayName, dropped });
    if (this.stopped || !text) return;

    this.transcript.add({ kind: "human", speaker, text, at: endedAt });
    const reason = this.addressing.evaluate({ speakerId: speaker.id, text, at: endedAt });
    this.logger.info("Heard", { speaker: speaker.displayName, text, addressed: reason });
    if (!reason) return;

    this.replyQueue = this.replyQueue
      .then(() => this.reply(speaker))
      .catch((error: unknown) => this.logger.error("Reply failed", { error }));
  }

  private async reply(speaker: Speaker): Promise<void> {
    if (this.stopped) return;
    const abort = new AbortController();
    const reply: ActiveReply = { speakerId: speaker.id, abort };
    this.activeReply = reply;
    const spoken: string[] = [];

    try {
      // Read per reply so /voice and /persona apply mid-conversation.
      const { voice, persona } = await this.services.guildSettings.get(this.channel.guildId);
      const messages = buildChatMessages(
        { name: this.settings.botName, personality: persona },
        this.transcript.recent(this.services.clock.now()),
        speaker,
      );
      const tokens = this.services.languageModel.streamChat(messages, abort.signal);
      await this.speak(toSentences(tokens), voice, abort.signal, spoken);
    } catch (error) {
      if (!abort.signal.aborted) throw error;
    } finally {
      if (this.activeReply === reply) this.activeReply = undefined;
      const now = this.services.clock.now();
      if (spoken.length > 0) {
        this.transcript.add({ kind: "assistant", text: spoken.join(" "), at: now, interrupted: abort.signal.aborted });
      }
      // Even an interrupted reply keeps the speaker in the conversation, so their next words count as a follow-up.
      this.addressing.recordReply(speaker.id, now);
      this.logger.info("Replied", { to: speaker.displayName, text: spoken.join(" "), interrupted: abort.signal.aborted });
    }
  }

  /** Synthesizes each sentence as soon as it arrives, while earlier sentences are still playing. */
  private async speak(
    sentences: AsyncIterable<string>,
    voice: VoiceGender,
    signal: AbortSignal,
    spoken: string[],
  ): Promise<void> {
    let playback = Promise.resolve();
    let failure: unknown;

    for await (const sentence of sentences) {
      if (signal.aborted || failure !== undefined) break;
      const text = toSpeakableText(sentence);
      if (!text) continue;

      const audio = this.services.textToSpeech.synthesize(text, voice, signal);
      audio.catch(() => undefined);
      playback = playback
        .then(async () => {
          if (signal.aborted || failure !== undefined) return;
          const pcm = await audio;
          if (signal.aborted) return;
          spoken.push(text);
          await this.channel.play(pcm, signal);
        })
        .catch((error: unknown) => {
          failure ??= error;
        });
    }

    await playback;
    if (failure !== undefined && !signal.aborted) throw failure;
  }

  private handleSpeakingStart(speaker: Speaker): void {
    const reply = this.activeReply;
    if (!reply || reply.speakerId !== speaker.id) return;
    this.clearBargeInTimer(speaker.id);
    this.bargeInTimers.set(
      speaker.id,
      setTimeout(() => {
        this.bargeInTimers.delete(speaker.id);
        if (this.activeReply !== reply) return;
        this.logger.info("Interrupted by speaker", { speaker: speaker.displayName });
        reply.abort.abort();
      }, this.settings.bargeInAfterMs),
    );
  }

  private clearBargeInTimer(speakerId: string): void {
    clearTimeout(this.bargeInTimers.get(speakerId));
    this.bargeInTimers.delete(speakerId);
  }
}

async function* toSentences(tokens: AsyncIterable<string>): AsyncIterable<string> {
  const chunker = new SentenceChunker();
  for await (const token of tokens) yield* chunker.push(token);
  const rest = chunker.flush();
  if (rest) yield rest;
}
