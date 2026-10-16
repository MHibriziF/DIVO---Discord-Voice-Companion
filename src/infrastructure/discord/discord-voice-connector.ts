import { entersState, joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice";
import type { Client } from "discord.js";
import type { Logger } from "../../application/ports/logger.js";
import type { VoiceChannel, VoiceChannelConnector } from "../../application/ports/voice-channel.js";
import { DiscordVoiceChannel, type VoiceCaptureOptions } from "./discord-voice-channel.js";

const READY_TIMEOUT_MS = 20_000;

export class DiscordVoiceConnector implements VoiceChannelConnector {
  constructor(
    private readonly client: Client,
    private readonly captureOptions: VoiceCaptureOptions,
    private readonly logger: Logger,
  ) {}

  async connect(guildId: string, channelId: string): Promise<VoiceChannel> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error(`Guild ${guildId} is not available to this bot`);

    const connection = joinVoiceChannel({
      guildId,
      channelId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
      daveEncryption: true,
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
    } catch (error) {
      connection.destroy();
      throw error;
    }

    return new DiscordVoiceChannel(
      connection,
      guild,
      channelId,
      this.captureOptions,
      this.logger.child({ guildId, channelId }),
    );
  }
}
