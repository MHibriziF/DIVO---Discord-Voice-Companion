import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Logger } from "../../../application/ports/logger.js";
import type { VoiceSessionManager } from "../../../application/services/voice-session-manager.js";
import type { SlashCommand } from "./slash-command.js";

export function createJoinCommand(sessions: VoiceSessionManager, botName: string, logger: Logger): SlashCommand {
  return {
    definition: new SlashCommandBuilder()
      .setName("join")
      .setDescription(`Bring ${botName} into your voice channel`)
      .setContexts(0)
      .toJSON(),

    async execute(interaction) {
      if (!interaction.inCachedGuild()) return;
      const channel = interaction.member.voice.channel;
      if (!channel) {
        await interaction.reply({ content: "Join a voice channel first.", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply();
      try {
        const outcome = await sessions.join(interaction.guildId, channel.id);
        const message =
          outcome === "already-here"
            ? `I'm already in ${channel}.`
            : `Joined ${channel}. I transcribe what's said here so I can answer when you say "${botName}". Use /leave to stop.`;
        await interaction.editReply(message);
      } catch (error) {
        logger.error("Failed to join voice channel", { guildId: interaction.guildId, error });
        await interaction.editReply("I couldn't connect to that voice channel. Check that I can Connect and Speak there.");
      }
    },
  };
}
