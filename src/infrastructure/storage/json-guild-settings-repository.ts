import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { GuildSettingsRepository } from "../../application/ports/guild-settings-repository.js";
import { type GuildSettingsOverrides, MAX_PERSONA_LENGTH, VOICE_GENDERS } from "../../domain/guild-settings.js";

const fileSchema = z.record(
  z.string(),
  z.object({
    voice: z.enum(VOICE_GENDERS).optional(),
    persona: z.string().max(MAX_PERSONA_LENGTH).optional(),
  }),
);

/**
 * Keeps all guild settings in memory and writes one small JSON file, only when a setting changes.
 * Fine for one bot process; switch to a database if this ever runs as several instances.
 */
export class JsonGuildSettingsRepository implements GuildSettingsRepository {
  private settings: Map<string, GuildSettingsOverrides> | undefined;
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  /** Reads the file up front so a corrupt file stops startup instead of failing every reply. */
  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.settings = new Map();
      return;
    }
    const parsed = fileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error(`${this.filePath} is not a valid settings file: ${parsed.error.message}`);
    this.settings = new Map(Object.entries(parsed.data));
  }

  async find(guildId: string): Promise<GuildSettingsOverrides | undefined> {
    return (await this.all()).get(guildId);
  }

  async save(guildId: string, overrides: GuildSettingsOverrides): Promise<void> {
    const settings = await this.all();
    if (Object.keys(overrides).length === 0) settings.delete(guildId);
    else settings.set(guildId, overrides);

    const json = JSON.stringify(Object.fromEntries(settings), null, 2);
    this.writes = this.writes.catch(() => undefined).then(() => this.writeAtomically(json));
    await this.writes;
  }

  private async all(): Promise<Map<string, GuildSettingsOverrides>> {
    if (!this.settings) await this.load();
    return this.settings!;
  }

  private async writeAtomically(json: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, json, "utf8");
    await rename(temporary, this.filePath);
  }
}
