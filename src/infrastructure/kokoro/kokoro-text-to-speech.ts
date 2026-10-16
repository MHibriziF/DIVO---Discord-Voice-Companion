import { KokoroTTS } from "kokoro-js";
import type { TextToSpeech } from "../../application/ports/text-to-speech.js";
import type { PcmAudio } from "../../domain/audio.js";
import type { VoiceGender } from "../../domain/guild-settings.js";
import { pcmFromFloat32 } from "../audio/pcm.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

type KokoroVoice = NonNullable<Parameters<KokoroTTS["generate"]>[1]>["voice"];

export interface KokoroOptions {
  /** Kokoro voice id per gender, e.g. af_heart / am_michael. */
  readonly voices: Record<VoiceGender, string>;
  readonly dtype: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
  readonly speed: number;
}

/** Local, free text-to-speech. The model (~300 MB) downloads from Hugging Face on first use. */
export class KokoroTextToSpeech implements TextToSpeech {
  private model: Promise<KokoroTTS> | undefined;
  // The ONNX session runs one generation at a time; queue requests instead of racing them.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: KokoroOptions) {}

  /** Loads the model and runs one generation; the first inference is several times slower than later ones. */
  async warmUp(): Promise<void> {
    await this.synthesize("Hi.", "female");
  }

  synthesize(text: string, voice: VoiceGender, signal?: AbortSignal): Promise<PcmAudio> {
    const job = this.queue.then(async () => {
      signal?.throwIfAborted();
      const model = await this.load();
      const audio = await model.generate(text, { voice: this.options.voices[voice] as KokoroVoice, speed: this.options.speed });
      return pcmFromFloat32(audio.audio, audio.sampling_rate);
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  private load(): Promise<KokoroTTS> {
    this.model ??= KokoroTTS.from_pretrained(MODEL_ID, { dtype: this.options.dtype, device: "cpu" });
    return this.model;
  }
}
