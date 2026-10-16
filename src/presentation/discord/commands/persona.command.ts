import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { GuildSettingsService } from "../../../application/services/guild-settings-service.js";
import { InvalidPersonaError, MAX_PERSONA_LENGTH } from "../../../domain/guild-settings.js";
import type { SlashCommand } from "./slash-command.js";

// Persona text is user-written; never let it ping @everyone or roles when echoed back.
const noMentions = { parse: [] };

export function createPersonaCommand(settings: GuildSettingsService, botName: string): SlashCommand {
  return {
    definition: new SlashCommandBuilder()
      .setName("persona")
      .setDescription(`Customize ${botName}'s personality`)
      .setContexts(0)
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription(`Describe how ${botName} should act`)
          .addStringOption((option) =>
            option
              .setName("description")
              .setDescription('e.g. "A sarcastic pirate who loves bad puns"')
              .setRequired(true)
              .setMaxLength(MAX_PERSONA_LENGTH),
          ),
      )
      .addSubcommand((sub) => sub.setName("show").setDescription(`Show ${botName}'s current personality`))
      .addSubcommand((sub) => sub.setName("reset").setDescription("Go back to the default personality"))
      .toJSON(),

    async execute(interaction) {
      if (!interaction.inCachedGuild()) return;
      const guildId = interaction.guildId;

      switch (interaction.options.getSubcommand()) {
        case "set": {
          try {
            const persona = await settings.setPersona(guildId, interaction.options.getString("description", true));
            await interaction.reply({
              content: `Persona updated. ${botName} will act like this from the next reply:\n> ${persona}`,
              allowedMentions: noMentions,
            });
          } catch (error) {
            if (!(error instanceof InvalidPersonaError)) throw error;
            await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
          }
          return;
        }
        case "show": {
          const { persona } = await settings.get(guildId);
          await interaction.reply({
            content: persona ? `${botName}'s personality:\n> ${persona}` : `${botName} is using the default personality.`,
            allowedMentions: noMentions,
          });
          return;
        }
        case "reset": {
          await settings.resetPersona(guildId);
          await interaction.reply(`${botName} is back to the default personality.`);
          return;
        }
      }
    },
  };
}
