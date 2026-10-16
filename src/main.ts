import Groq from "groq-sdk";
import type { ConversationServices, ConversationSettings } from "./application/services/voice-conversation.js";
import { VoiceConversation } from "./application/services/voice-conversation.js";
import { VoiceSessionManager } from "./application/services/voice-session-manager.js";
import { loadConfig } from "./config/env.js";
import { createDiscordClient } from "./infrastructure/discord/discord-client.js";
import { DiscordVoiceConnector } from "./infrastructure/discord/discord-voice-connector.js";
import { GroqLanguageModel } from "./infrastructure/groq/groq-language-model.js";
import { GroqSpeechToText } from "./infrastructure/groq/groq-speech-to-text.js";
import { KokoroTextToSpeech } from "./infrastructure/kokoro/kokoro-text-to-speech.js";
import { createPinoLogger } from "./infrastructure/logging/pino-logger.js";
import { createJoinCommand } from "./presentation/discord/commands/join.command.js";
import { createLeaveCommand } from "./presentation/discord/commands/leave.command.js";
import { attachDiscordBot } from "./presentation/discord/discord-bot.js";

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = createPinoLogger(config.logLevel);

  const groq = new Groq({ apiKey: config.groq.apiKey });
  const textToSpeech = new KokoroTextToSpeech(config.kokoro);

  const services: ConversationServices = {
    speechToText: new GroqSpeechToText(groq, {
      model: config.groq.sttModel,
      language: config.groq.sttLanguage,
      vocabularyHint: [config.bot.name, ...config.bot.aliases].join(", "),
    }),
    languageModel: new GroqLanguageModel(groq, {
      model: config.groq.llmModel,
      maxCompletionTokens: 512,
      temperature: 0.8,
      reasoningEffort: config.groq.reasoningEffort,
    }),
    textToSpeech,
    clock: { now: () => Date.now() },
    logger,
  };

  const settings: ConversationSettings = {
    persona: { name: config.bot.name, extraInstructions: config.bot.persona },
    addressing: { names: [config.bot.name, ...config.bot.aliases], followUpWindowMs: config.bot.followUpWindowMs },
    transcriptLimits: { maxEntries: 40, maxAgeMs: 10 * 60_000 },
    minUtteranceMs: 400,
    bargeInAfterMs: 600,
  };

  const client = createDiscordClient();
  const connector = new DiscordVoiceConnector(
    client,
    { silenceMs: 800, maxUtteranceMs: 30_000, captureFormat: { sampleRate: 16_000, channels: 1 } },
    logger,
  );
  const sessions = new VoiceSessionManager(
    connector,
    (channel, onStopped) => new VoiceConversation(channel, services, settings, onStopped),
    logger,
  );

  attachDiscordBot({
    client,
    sessions,
    logger,
    devGuildId: config.discord.devGuildId,
    commands: [createJoinCommand(sessions, config.bot.name, logger), createLeaveCommand(sessions)],
  });

  logger.info("Loading text-to-speech model (first run downloads ~90 MB)");
  textToSpeech
    .warmUp()
    .then(() => logger.info("Text-to-speech ready"))
    .catch((error: unknown) => logger.error("Text-to-speech failed to load", { error }));

  const shutdown = () => {
    logger.info("Shutting down");
    sessions.leaveAll();
    void client.destroy().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await client.login(config.discord.token);
}

// Kokoro's phonemizer installs process-wide handlers that rethrow, so report startup failures here.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
