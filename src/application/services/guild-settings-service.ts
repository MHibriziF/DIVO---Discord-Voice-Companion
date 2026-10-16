import {
  type GuildSettings,
  type GuildSettingsOverrides,
  normalizePersona,
  type VoiceGender,
} from "../../domain/guild-settings.js";
import type { GuildSettingsRepository } from "../ports/guild-settings-repository.js";

export class GuildSettingsService {
  constructor(
    private readonly repository: GuildSettingsRepository,
    private readonly defaults: GuildSettings,
  ) {}

  async get(guildId: string): Promise<GuildSettings> {
    const overrides = (await this.repository.find(guildId)) ?? {};
    return {
      voice: overrides.voice ?? this.defaults.voice,
      persona: overrides.persona ?? this.defaults.persona,
    };
  }

  async setVoice(guildId: string, voice: VoiceGender): Promise<void> {
    await this.update(guildId, (overrides) => ({ ...overrides, voice }));
  }

  /** Returns the persona as stored, after trimming. Throws InvalidPersonaError if it's empty or too long. */
  async setPersona(guildId: string, text: string): Promise<string> {
    const persona = normalizePersona(text);
    await this.update(guildId, (overrides) => ({ ...overrides, persona }));
    return persona;
  }

  async resetPersona(guildId: string): Promise<void> {
    await this.update(guildId, (overrides) => {
      const rest = { ...overrides };
      delete rest.persona;
      return rest;
    });
  }

  private async update(
    guildId: string,
    change: (overrides: GuildSettingsOverrides) => GuildSettingsOverrides,
  ): Promise<void> {
    const current = (await this.repository.find(guildId)) ?? {};
    await this.repository.save(guildId, change(current));
  }
}
