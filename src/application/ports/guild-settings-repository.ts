import type { GuildSettingsOverrides } from "../../domain/guild-settings.js";

export interface GuildSettingsRepository {
  find(guildId: string): Promise<GuildSettingsOverrides | undefined>;
  /** Saving empty overrides removes the guild's entry. */
  save(guildId: string, overrides: GuildSettingsOverrides): Promise<void>;
}
