import { describe, expect, it } from "vitest";
import type { GuildSettingsRepository } from "../../src/application/ports/guild-settings-repository.js";
import { GuildSettingsService } from "../../src/application/services/guild-settings-service.js";
import type { GuildSettingsOverrides } from "../../src/domain/guild-settings.js";

function inMemoryRepository(): GuildSettingsRepository & { data: Map<string, GuildSettingsOverrides> } {
  const data = new Map<string, GuildSettingsOverrides>();
  return {
    data,
    find: async (guildId) => data.get(guildId),
    save: async (guildId, overrides) => {
      if (Object.keys(overrides).length === 0) data.delete(guildId);
      else data.set(guildId, overrides);
    },
  };
}

const defaults = { voice: "female", persona: "Cheerful and curious" } as const;

describe("GuildSettingsService", () => {
  it("falls back to defaults for servers without settings", async () => {
    const service = new GuildSettingsService(inMemoryRepository(), defaults);
    expect(await service.get("g")).toEqual(defaults);
  });

  it("stores voice and persona per server", async () => {
    const service = new GuildSettingsService(inMemoryRepository(), defaults);
    await service.setVoice("a", "male");
    await service.setPersona("a", "  A grumpy pirate ");

    expect(await service.get("a")).toEqual({ voice: "male", persona: "A grumpy pirate" });
    expect(await service.get("b")).toEqual(defaults);
  });

  it("resets the persona but keeps the voice", async () => {
    const repository = inMemoryRepository();
    const service = new GuildSettingsService(repository, defaults);
    await service.setVoice("a", "male");
    await service.setPersona("a", "A grumpy pirate");

    await service.resetPersona("a");

    expect(await service.get("a")).toEqual({ voice: "male", persona: "Cheerful and curious" });
    expect(repository.data.get("a")).toEqual({ voice: "male" });
  });
});
