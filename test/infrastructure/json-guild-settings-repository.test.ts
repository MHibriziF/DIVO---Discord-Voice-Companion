import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonGuildSettingsRepository } from "../../src/infrastructure/storage/json-guild-settings-repository.js";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "divo-settings-"));
  file = join(dir, "nested", "guild-settings.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("JsonGuildSettingsRepository", () => {
  it("starts empty when the file doesn't exist", async () => {
    const repository = new JsonGuildSettingsRepository(file);
    await repository.load();
    expect(await repository.find("g")).toBeUndefined();
  });

  it("persists settings across instances", async () => {
    await new JsonGuildSettingsRepository(file).save("g", { voice: "male", persona: "A pirate" });

    const reloaded = new JsonGuildSettingsRepository(file);
    await reloaded.load();
    expect(await reloaded.find("g")).toEqual({ voice: "male", persona: "A pirate" });
  });

  it("removes a server when its overrides are empty", async () => {
    const repository = new JsonGuildSettingsRepository(file);
    await repository.save("g", { voice: "male" });
    await repository.save("g", {});
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({});
  });

  it("refuses to start on a corrupt file", async () => {
    await new JsonGuildSettingsRepository(file).save("g", { voice: "male" });
    await writeFile(file, JSON.stringify({ g: { voice: "robot" } }));
    await expect(new JsonGuildSettingsRepository(file).load()).rejects.toThrow("not a valid settings file");
  });
});
