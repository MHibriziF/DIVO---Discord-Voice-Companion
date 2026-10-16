import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { GuildSettingsService } from "../../../application/services/guild-settings-service.js";
import { isVoiceGender } from "../../../domain/guild-settings.js";
import type { SlashCommand } from "./slash-command.js";

export function createVoiceCommand(settings: GuildSettingsService, botName: string): SlashCommand {
  return {
    definition: new SlashCommandBuilder()
      .setName("voice")
      .setDescription(`Choose ${botName}'s voice`)
      .setContexts(0)
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("Which voice to use")
          .setRequired(true)
          .addChoices({ name: "Female", value: "female" }, { name: "Male", value: "male" }),
      )
      .toJSON(),

    async execute(interaction) {
      if (!interaction.inCachedGuild()) return;
      const voice = interaction.options.getString("type", true);
      if (!isVoiceGender(voice)) {
        await interaction.reply({ content: "Pick Female or Male.", flags: MessageFlags.Ephemeral });
        return;
      }
      await settings.setVoice(interaction.guildId, voice);
      await interaction.reply(`${botName} will now speak with a **${voice}** voice.`);
    },
  };
}
