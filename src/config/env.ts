import { z } from "zod";
import { VOICE_GENDERS } from "../domain/guild-settings.js";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const schema = z.object({
  DISCORD_TOKEN: z.string({ error: "is required" }).trim(),
  DISCORD_DEV_GUILD_ID: optionalText,

  GROQ_API_KEY: z.string({ error: "is required" }).trim(),
  GROQ_STT_MODEL: z.string().trim().default("whisper-large-v3-turbo"),
  GROQ_LLM_MODEL: z.string().trim().default("openai/gpt-oss-20b"),
  GROQ_REASONING_EFFORT: z.enum(["low", "medium", "high", "off"]).optional(),
  STT_LANGUAGE: optionalText,
  STT_MAX_NO_SPEECH_PROB: z.coerce.number().min(0).max(1).default(0.6),

  BOT_NAME: z.string().trim().min(1).default("Divo"),
  BOT_ALIASES: z.string().default(""),
  BOT_PERSONA: optionalText,
  DEFAULT_VOICE: z.enum(VOICE_GENDERS).default("female"),
  FOLLOW_UP_WINDOW_MS: z.coerce.number().int().nonnegative().default(10_000),

  KOKORO_FEMALE_VOICE: z.string().trim().default("af_heart"),
  KOKORO_MALE_VOICE: z.string().trim().default("am_michael"),
  KOKORO_DTYPE: z.enum(["fp32", "fp16", "q8", "q4", "q4f16"]).default("fp32"),
  KOKORO_SPEED: z.coerce.number().positive().default(1),

  DATA_DIR: z.string().trim().default("data"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv) {
  // `KEY=` lines in .env mean "not set", so they fall back to defaults instead of failing validation.
  const provided = Object.fromEntries(Object.entries(env).filter(([, value]) => value?.trim()));
  const parsed = schema.safeParse(provided);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid configuration (see .env.example):\n${problems}`);
  }
  const e = parsed.data;
  const isReasoningModel = e.GROQ_LLM_MODEL.startsWith("openai/gpt-oss") || e.GROQ_LLM_MODEL.startsWith("qwen/");
  const reasoningEffort = e.GROQ_REASONING_EFFORT ?? (isReasoningModel ? "low" : "off");

  return {
    logLevel: e.LOG_LEVEL,
    discord: { token: e.DISCORD_TOKEN, devGuildId: e.DISCORD_DEV_GUILD_ID },
    groq: {
      apiKey: e.GROQ_API_KEY,
      sttModel: e.GROQ_STT_MODEL,
      sttLanguage: e.STT_LANGUAGE,
      maxNoSpeechProbability: e.STT_MAX_NO_SPEECH_PROB,
      llmModel: e.GROQ_LLM_MODEL,
      reasoningEffort: reasoningEffort === "off" ? undefined : reasoningEffort,
    },
    bot: {
      name: e.BOT_NAME,
      aliases: e.BOT_ALIASES.split(",").map((alias) => alias.trim()).filter(Boolean),
      persona: e.BOT_PERSONA,
      defaultVoice: e.DEFAULT_VOICE,
      followUpWindowMs: e.FOLLOW_UP_WINDOW_MS,
    },
    kokoro: {
      voices: { female: e.KOKORO_FEMALE_VOICE, male: e.KOKORO_MALE_VOICE },
      dtype: e.KOKORO_DTYPE,
      speed: e.KOKORO_SPEED,
    },
    dataDir: e.DATA_DIR,
  };
}
