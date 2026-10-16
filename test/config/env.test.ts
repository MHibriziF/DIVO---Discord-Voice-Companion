import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env.js";

describe("loadConfig", () => {
  it("accepts .env.example with only the required keys filled in", () => {
    const example = parseEnv(readFileSync(".env.example", "utf8"));
    const config = loadConfig({ ...example, DISCORD_TOKEN: "token", GROQ_API_KEY: "key" });

    expect(config.groq.reasoningEffort).toBe("low");
    expect(config.groq.sttLanguage).toBeUndefined();
    expect(config.bot.persona).toBeUndefined();
    expect(config.bot.aliases).toEqual(["deevo", "devo", "dee vo"]);
  });

  it("names every missing required key", () => {
    expect(() => loadConfig({ DISCORD_TOKEN: "", GROQ_API_KEY: " " })).toThrow(/DISCORD_TOKEN[\s\S]*GROQ_API_KEY/);
  });
});
