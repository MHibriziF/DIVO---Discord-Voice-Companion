import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const schema = z.object({
  DISCORD_TOKEN: z.string().trim().min(1, "DISCORD_TOKEN is required"),
  DISCORD_DEV_GUILD_ID: optionalText,

  GROQ_API_KEY: z.string().trim().min(1, "GROQ_API_KEY is required"),
  GROQ_STT_MODEL: z.string().trim().default("whisper-large-v3-turbo"),
  GROQ_LLM_MODEL: z.string().trim().default("openai/gpt-oss-20b"),
  GROQ_REASONING_EFFORT: z.enum(["low", "medium", "high", "off"]).optional(),
  STT_LANGUAGE: optionalText,

  BOT_NAME: z.string().trim().min(1).default("Divo"),
  BOT_ALIASES: z.string().default(""),
  BOT_PERSONA: optionalText,
  FOLLOW_UP_WINDOW_MS: z.coerce.number().int().nonnegative().default(10_000),

  KOKORO_VOICE: z.string().trim().default("af_heart"),
  KOKORO_DTYPE: z.enum(["fp32", "fp16", "q8", "q4", "q4f16"]).default("fp32"),
  KOKORO_SPEED: z.coerce.number().positive().default(1),

  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = schema.safeParse(env);
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
      llmModel: e.GROQ_LLM_MODEL,
      reasoningEffort: reasoningEffort === "off" ? undefined : reasoningEffort,
    },
    bot: {
      name: e.BOT_NAME,
      aliases: e.BOT_ALIASES.split(",").map((alias) => alias.trim()).filter(Boolean),
      persona: e.BOT_PERSONA,
      followUpWindowMs: e.FOLLOW_UP_WINDOW_MS,
    },
    kokoro: { voice: e.KOKORO_VOICE, dtype: e.KOKORO_DTYPE, speed: e.KOKORO_SPEED },
  };
}
