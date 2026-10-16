import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { VoiceSessionManager } from "../../../application/services/voice-session-manager.js";
import type { SlashCommand } from "./slash-command.js";

export function createLeaveCommand(sessions: VoiceSessionManager): SlashCommand {
  return {
    definition: new SlashCommandBuilder()
      .setName("leave")
      .setDescription("Make the bot leave the voice channel")
      .setContexts(0)
      .toJSON(),

    async execute(interaction) {
      if (!interaction.inCachedGuild()) return;
      const left = sessions.leave(interaction.guildId);
      await interaction.reply(
        left ? "Bye! 👋" : { content: "I'm not in a voice channel.", flags: MessageFlags.Ephemeral },
      );
    },
  };
}
