import type { Logger } from "../ports/logger.js";
import type { VoiceChannel, VoiceChannelConnector } from "../ports/voice-channel.js";
import type { VoiceConversation } from "./voice-conversation.js";

export type ConversationFactory = (channel: VoiceChannel, onStopped: () => void) => VoiceConversation;

export type JoinOutcome = "joined" | "moved" | "already-here";

/** Keeps at most one conversation per guild. */
export class VoiceSessionManager {
  private readonly sessions = new Map<string, VoiceConversation>();

  constructor(
    private readonly connector: VoiceChannelConnector,
    private readonly createConversation: ConversationFactory,
    private readonly logger: Logger,
  ) {}

  async join(guildId: string, channelId: string): Promise<JoinOutcome> {
    const existing = this.sessions.get(guildId);
    if (existing?.channelId === channelId) return "already-here";
    existing?.stop();

    const channel = await this.connector.connect(guildId, channelId);
    const conversation = this.createConversation(channel, () => {
      if (this.sessions.get(guildId) === conversation) this.sessions.delete(guildId);
    });
    this.sessions.set(guildId, conversation);
    conversation.start();
    this.logger.info("Joined voice channel", { guildId, channelId });
    return existing ? "moved" : "joined";
  }

  leave(guildId: string): boolean {
    const conversation = this.sessions.get(guildId);
    conversation?.stop();
    return conversation !== undefined;
  }

  leaveAll(): void {
    for (const conversation of [...this.sessions.values()]) conversation.stop();
  }

  activeChannelId(guildId: string): string | undefined {
    return this.sessions.get(guildId)?.channelId;
  }
}
