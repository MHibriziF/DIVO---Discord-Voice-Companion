# DIVO — Discord Voice Companion

A Discord bot that joins a voice channel, transcribes everyone, notices when someone talks **to it** (by name, or as a follow-up), and answers out loud.

Stack: TypeScript (ESM, Node ≥ 22.12) · discord.js + @discordjs/voice (DAVE E2EE via @snazzah/davey) · Groq (Whisper speech-to-text and LLM) · Kokoro (local text-to-speech) · zod · pino · vitest.

## Commands

```bash
npm run dev        # run with hot reload (reads .env)
npm run build      # compile to dist/
npm start          # run the compiled bot (reads .env)
npm test           # unit tests
npm run lint       # ESLint, including the layer rules below
npm run typecheck
```

Setup: copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `GROQ_API_KEY`. In the Discord Developer Portal, invite the bot with the `bot` and `applications.commands` scopes and the Connect + Speak permissions. Set `DISCORD_DEV_GUILD_ID` while developing, so slash commands show up immediately.

## Architecture

Clean / hexagonal architecture. Dependencies point **inward only**:

```
presentation ─┐
              ├──► application ──► domain
infrastructure┘        ▲
                       │ implements ports
main.ts (composition root) wires everything together
```

| Layer | Folder | Holds | May import |
|---|---|---|---|
| Domain | `src/domain/` | Pure business rules and value types: who is speaking, what was said, whether it was addressed to the bot, how to split replies into sentences. No I/O, no timers, no vendor SDKs. | nothing outside `domain/` |
| Application | `src/application/` | Use cases (`services/`) and the **ports** (`ports/`): interfaces for everything external (speech-to-text, LLM, text-to-speech, voice channel, logger, clock). Orchestrates the domain. | `domain/` |
| Infrastructure | `src/infrastructure/` | **Adapters** implementing ports with real tech: Discord voice, Groq, Kokoro, pino, PCM/WAV conversion. All vendor SDK code lives here. | `application/ports`, `domain/` |
| Presentation | `src/presentation/` | How users drive the app: slash commands and Discord event handlers. Calls application services; contains no business rules. | `application/`, `domain/`, discord.js |
| Config | `src/config/` | Parses and validates env vars (zod). | — (only `main.ts` imports it) |
| Composition root | `src/main.ts` | Builds the adapters, injects them into services, starts the bot. The only file that knows every concrete class. | everything |

ESLint enforces these boundaries with `no-restricted-imports` (`eslint.config.js`). If lint flags an import across layers, change the design: add or extend a port. Don't bypass the rule.

### Directory map

```
src/
  domain/
    audio.ts                 PcmAudio value type
    speaker.ts               Speaker value type
    addressing-policy.ts     "Was this said to the bot?" (fuzzy name match + follow-up window)
    room-transcript.ts       Rolling log of who said what
    sentence-chunker.ts      Streams LLM tokens into speakable sentences
    speech-text.ts           Whisper-noise filter, markdown stripping for TTS
  application/
    ports/                   SpeechToText, LanguageModel, TextToSpeech, VoiceChannel(+Connector), Logger, Clock
    services/
      voice-conversation.ts  One conversation per voice channel: hear → transcribe → decide → reply → speak
      voice-session-manager.ts  One conversation per guild; join/leave
      prompt-builder.ts      Persona + transcript → chat messages
  infrastructure/
    discord/                 Client, voice connector, DiscordVoiceChannel (Opus receive/decode, playback)
    groq/                    GroqSpeechToText (Whisper), GroqLanguageModel (streaming chat)
    kokoro/                  KokoroTextToSpeech (local ONNX model)
    audio/pcm.ts             Downmix/resample/WAV encoding
    logging/pino-logger.ts
  presentation/discord/
    discord-bot.ts           Registers slash commands, routes interactions, auto-leaves empty channels
    commands/                /join, /leave
  config/env.ts
  main.ts
test/                        Mirrors src/ (domain, application, infrastructure)
```

### Runtime flow

1. `/join` → `VoiceSessionManager.join` → `DiscordVoiceConnector` joins with DAVE and returns a `VoiceChannel`.
2. `DiscordVoiceChannel` subscribes to each speaking user. Each utterance ends after 800 ms of silence (max 30 s). Opus is decoded to 48 kHz stereo, then converted to 16 kHz mono → `onUtterance`.
3. `VoiceConversation`:
   - drops clips under 400 ms;
   - transcribes with Groq Whisper (the bot's name is passed as a vocabulary hint);
   - filters Whisper's noise phrases ("Thank you.");
   - adds the line to the `RoomTranscript`;
   - asks `AddressingPolicy` whether the line was addressed to the bot.
4. If addressed, the reply is queued (one at a time). The LLM's token stream goes through `SentenceChunker`. Each sentence goes to TTS as soon as it's complete, and plays while the next one is synthesized.
5. **Barge-in:** if the person being answered talks for > 600 ms while the bot is replying, the reply is aborted. They stay in the follow-up window, so the bot answers what they say next.
6. The bot leaves when no humans remain in the channel (`discord-bot.ts`). An idle bot makes no API calls.

### Adding or swapping a provider

1. Implement the port (e.g. `TextToSpeech`) in a new folder under `src/infrastructure/<vendor>/`.
2. Add its env vars to `src/config/env.ts` and `.env.example`.
3. Pick it in `src/main.ts`. Domain, application and presentation code must not change.

## Constraints and gotchas

- **DAVE is mandatory** for Discord voice since March 2026. Keep `@snazzah/davey` as a direct dependency and `daveEncryption: true`.
- **Voice receive is undocumented by Discord** and can break. A known @discordjs/voice issue (discord.js #11419) causes repeated `DecryptionFailed` errors. Recovery is to rejoin.
- `selfDeaf` must stay `false`, otherwise Discord sends the bot no audio.
- Kokoro downloads ~90 MB from Hugging Face on first start. Benchmarked on a 20-thread CPU, 3 s of speech took ~0.9 s with `fp32`, ~0.55 s with `q4`, and ~2.7 s with `q8`. Don't use `q8`.
- Kokoro's `phonemizer` dependency registers process-wide `unhandledRejection`/`uncaughtException` handlers that rethrow, so **any unhandled promise rejection crashes the bot**. Always attach a `.catch` to promises you don't await.
- Discord voice audio travels over **UDP**, so the bot must run as a long-lived Node process (PC, VPS). It can't run on Cloudflare Workers or Containers (no outbound UDP), or on any other serverless platform.
- Groq reasoning models (`openai/gpt-oss-*`, `qwen/*`) get `reasoning_effort: low` and hidden reasoning by default. Other models must not get those params (config sets `off`).

## Cost and quotas (Groq free tier)

Everything said in the channel is transcribed, because that's how the bot notices its name. Approximate free-tier limits (check the Groq console, they're per organization):

| Model | Limits | Our usage (4 people, 2 h/day) |
|---|---|---|
| `whisper-large-v3-turbo` | 20 req/min, 2,000 req/day, 7,200 audio-s/hour, 28,800 audio-s/day; each request counts as at least 10 s | ~600–1,000 utterances/day → fits; the 10 s minimum makes clip count the real limit |
| `openai/gpt-oss-20b` | 30 req/min, 1,000 req/day, 8K tokens/min, 200K tokens/day | ~60 replies × ~3K tokens ≈ 180K tokens/day → close to the daily token cap |

At 100× usage (a public bot), the free tier won't be enough. Options: the Groq paid tier, a wake-word engine so only addressed speech is transcribed, or local Whisper. Check with the user before adding anything that polls, runs in the background, or uses more quota per request (see the user's global cost guidelines).

## Conventions

- Strict TypeScript, ESM, `.js` suffix on relative imports.
- Keep domain logic pure and unit-tested. Test application services with fake ports (see `test/application/voice-conversation.test.ts`).
- Comment only what the code can't say.
- Conventional Commits: `type(scope): short message`.
