import { type Client, Events, MessageFlags, type VoiceState } from "discord.js";
import type { Logger } from "../../application/ports/logger.js";
import type { VoiceSessionManager } from "../../application/services/voice-session-manager.js";
import type { SlashCommand } from "./commands/slash-command.js";

export interface DiscordBotOptions {
  readonly client: Client;
  readonly commands: readonly SlashCommand[];
  readonly sessions: VoiceSessionManager;
  readonly logger: Logger;
  /** Registers commands to one guild (instant) instead of globally (can take a while to appear). */
  readonly devGuildId: string | undefined;
}

export function attachDiscordBot({ client, commands, sessions, logger, devGuildId }: DiscordBotOptions): void {
  const byName = new Map(commands.map((command) => [command.definition.name, command]));

  client.once(Events.ClientReady, async (ready) => {
    logger.info("Logged in", { user: ready.user.tag });
    const definitions = commands.map((command) => command.definition);
    try {
      if (devGuildId) await ready.application.commands.set(definitions, devGuildId);
      else await ready.application.commands.set(definitions);
      logger.info("Slash commands registered", { scope: devGuildId ? "guild" : "global" });
    } catch (error) {
      logger.error("Failed to register slash commands", { error });
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = byName.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error("Command failed", { command: interaction.commandName, error });
      const reply = { content: "Something went wrong.", flags: MessageFlags.Ephemeral } as const;
      if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => undefined);
      else await interaction.reply(reply).catch(() => undefined);
    }
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => leaveWhenAlone(oldState, newState, sessions, logger));
}

/** Leaving an empty channel stops all listening, so an idle bot costs nothing. */
function leaveWhenAlone(oldState: VoiceState, newState: VoiceState, sessions: VoiceSessionManager, logger: Logger): void {
  const guild = newState.guild;
  const channelId = sessions.activeChannelId(guild.id);
  if (!channelId || (oldState.channelId !== channelId && newState.channelId !== channelId)) return;

  const channel = guild.channels.cache.get(channelId);
  const humans = channel?.isVoiceBased() ? channel.members.filter((member) => !member.user.bot).size : 0;
  if (humans === 0) {
    logger.info("Leaving empty voice channel", { guildId: guild.id, channelId });
    sessions.leave(guild.id);
  }
}
