import { KokoroTextToSpeech } from "../src/infrastructure/kokoro/kokoro-text-to-speech.js";

const dtypes = (process.argv[2] ?? "fp32,q4").split(",") as ("fp32" | "fp16" | "q8" | "q4" | "q4f16")[];
const sentence = "Hey there! I'm Divo, nice to meet you all. What are we talking about?";
const runs = 3;

for (const dtype of dtypes) {
  const tts = new KokoroTextToSpeech({ voices: { female: "af_heart", male: "am_michael" }, dtype, speed: 1 });
  await tts.warmUp();

  let bestMs = Infinity;
  let audioMs = 0;
  for (let run = 0; run < runs; run++) {
    const started = Date.now();
    const audio = await tts.synthesize(sentence, "female");
    bestMs = Math.min(bestMs, Date.now() - started);
    audioMs = Math.round((audio.samples.length / audio.sampleRate) * 1000);
  }

  const ratio = bestMs / audioMs;
  const verdict = ratio < 0.5 ? "good" : ratio < 1 ? "usable, expect pauses" : "too slow";
  console.log(`${dtype}: ${bestMs} ms to make ${audioMs} ms of speech (${ratio.toFixed(2)}x real time) -> ${verdict}`);
}
