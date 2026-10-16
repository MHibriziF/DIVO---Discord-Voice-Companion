import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../../src/application/ports/language-model.js";
import type { Logger } from "../../src/application/ports/logger.js";
import type { VoiceChannel, VoiceChannelListener } from "../../src/application/ports/voice-channel.js";
import {
  type ConversationSettings,
  VoiceConversation,
} from "../../src/application/services/voice-conversation.js";
import type { PcmAudio } from "../../src/domain/audio.js";
import type { GuildSettings, VoiceGender } from "../../src/domain/guild-settings.js";
import type { TranscribedSegment } from "../../src/domain/speech-text.js";

const alice = { id: "1", displayName: "Alice" };
const oneSecond: PcmAudio = { samples: new Int16Array(16_000), sampleRate: 16_000, channels: 1 };
const blip: PcmAudio = { samples: new Int16Array(1_600), sampleRate: 16_000, channels: 1 };

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};

const settings: ConversationSettings = {
  botName: "Divo",
  addressing: { names: ["Divo"], followUpWindowMs: 10_000 },
  transcriptLimits: { maxEntries: 20, maxAgeMs: 600_000 },
  minUtteranceMs: 400,
  maxNoSpeechProbability: 0.6,
  bargeInAfterMs: 600,
};

function setup(options: {
  heard: (string | TranscribedSegment[])[];
  reply: string[];
  guild?: GuildSettings;
}) {
  let listener: VoiceChannelListener | undefined;
  const played: string[] = [];
  const voices: VoiceGender[] = [];
  const prompts: ChatMessage[][] = [];
  const heard = [...options.heard];

  const channel: VoiceChannel = {
    guildId: "g",
    channelId: "c",
    listen: (l) => {
      listener = l;
    },
    play: async (audio) => {
      played.push(new TextDecoder().decode(audio.samples));
    },
    disconnect: vi.fn(),
  };

  const conversation = new VoiceConversation(
    channel,
    {
      speechToText: {
        transcribe: async () => {
          const next = heard.shift() ?? [];
          return typeof next === "string" ? [{ text: next, noSpeechProbability: 0.01 }] : next;
        },
      },
      languageModel: {
        async *streamChat(messages) {
          prompts.push([...messages]);
          yield* options.reply;
        },
      },
      // Encode the text into the fake audio so the test can see what was "spoken".
      textToSpeech: {
        synthesize: async (text, voice) => {
          voices.push(voice);
          return {
          samples: new Int16Array(new TextEncoder().encode(text.padEnd(Math.ceil(text.length / 2) * 2)).buffer),
            sampleRate: 24_000,
            channels: 1,
          };
        },
      },
      guildSettings: { get: async () => options.guild ?? { voice: "female", persona: undefined } },
      clock: { now: () => 1_000 },
      logger: silentLogger,
    },
    settings,
  );
  conversation.start();

  const say = (audio: PcmAudio = oneSecond) => listener!.onUtterance({ speaker: alice, audio, endedAt: 1_000 });
  return { conversation, channel, say, played, voices, prompts, listener: () => listener! };
}

describe("VoiceConversation", () => {
  it("answers when addressed by name, speaking sentence by sentence", async () => {
    const { say, played, prompts } = setup({
      heard: ["Divo, tell me a joke"],
      reply: ["Why did the ", "chicken cross the road? ", "To get to the other side."],
    });

    say();

    await vi.waitFor(() => expect(played).toHaveLength(2));
    expect(played.map((text) => text.trim())).toEqual(["Why did the chicken cross the road?", "To get to the other side."]);
    expect(prompts[0]?.at(-1)).toEqual({ role: "user", content: "Alice: Divo, tell me a joke" });
  });

  it("stays quiet when not addressed", async () => {
    const { say, prompts } = setup({ heard: ["pass me the salt"], reply: ["Sure thing, here you go."] });

    say();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(prompts).toHaveLength(0);
  });

  it("answers follow-ups without the name", async () => {
    const { say, prompts } = setup({
      heard: ["Divo, what is two plus two?", "and times three?"],
      reply: ["That would be four."],
    });

    say();
    await vi.waitFor(() => expect(prompts).toHaveLength(1));
    say();
    await vi.waitFor(() => expect(prompts).toHaveLength(2));
  });

  it("ignores utterances that are too short to be speech", async () => {
    const { say, prompts } = setup({ heard: ["Divo"], reply: ["Hello there friend."] });

    say(blip);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(prompts).toHaveLength(0);
  });

  it("ignores segments Whisper thinks are not speech", async () => {
    const { say, prompts } = setup({
      heard: [[{ text: "Divo, thanks for watching!", noSpeechProbability: 0.9 }]],
      reply: ["Hello there friend."],
    });

    say();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(prompts).toHaveLength(0);
  });

  it("uses the server's chosen voice and persona", async () => {
    const { say, voices, prompts } = setup({
      heard: ["Divo, who are you?"],
      reply: ["Arr, I be Divo the pirate."],
      guild: { voice: "male", persona: "A grumpy pirate" },
    });

    say();

    await vi.waitFor(() => expect(voices).toEqual(["male"]));
    expect(prompts[0]?.[0]?.content).toContain("A grumpy pirate");
  });

  it("disconnects from the channel when stopped", () => {
    const { conversation, channel } = setup({ heard: [], reply: [] });
    conversation.stop();
    expect(channel.disconnect).toHaveBeenCalledOnce();
  });
});
