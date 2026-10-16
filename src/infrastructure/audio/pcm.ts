import type { PcmAudio } from "../../domain/audio.js";

export interface PcmFormat {
  readonly sampleRate: number;
  readonly channels: number;
}

export function pcmFromBuffer(buffer: Buffer, format: PcmFormat): PcmAudio {
  const usableBytes = buffer.byteLength - (buffer.byteLength % 2);
  // Copy so the Int16Array view is 2-byte aligned regardless of the Buffer's offset in its pool.
  const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + usableBytes);
  return { samples: new Int16Array(copy), ...format };
}

export function pcmToBuffer(audio: PcmAudio): Buffer {
  return Buffer.from(audio.samples.buffer, audio.samples.byteOffset, audio.samples.byteLength);
}

export function pcmFromFloat32(samples: Float32Array, sampleRate: number): PcmAudio {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    out[i] = Math.round(clamped * 0x7fff);
  }
  return { samples: out, sampleRate, channels: 1 };
}

export function convertPcm(audio: PcmAudio, target: PcmFormat): PcmAudio {
  if (audio.sampleRate === target.sampleRate && audio.channels === target.channels) return audio;
  const mono = resample(toMono(audio), target.sampleRate);
  return target.channels === 1 ? mono : spreadChannels(mono, target.channels);
}

export function encodeWav(audio: PcmAudio): Buffer {
  const data = pcmToBuffer(audio);
  const header = Buffer.alloc(44);
  const byteRate = audio.sampleRate * audio.channels * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.byteLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(audio.channels, 22);
  header.writeUInt32LE(audio.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(audio.channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.byteLength, 40);
  return Buffer.concat([header, data]);
}

function toMono(audio: PcmAudio): PcmAudio {
  if (audio.channels === 1) return audio;
  const frames = Math.floor(audio.samples.length / audio.channels);
  const out = new Int16Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < audio.channels; channel++) sum += audio.samples[frame * audio.channels + channel]!;
    out[frame] = Math.round(sum / audio.channels);
  }
  return { samples: out, sampleRate: audio.sampleRate, channels: 1 };
}

function resample(mono: PcmAudio, targetRate: number): PcmAudio {
  if (mono.sampleRate === targetRate) return mono;
  const { samples, sampleRate } = mono;
  const ratio = sampleRate / targetRate;
  const length = Math.floor(samples.length / ratio);
  const out = new Int16Array(length);

  if (Number.isInteger(ratio)) {
    // Integer downsampling (48k -> 16k): averaging each group doubles as a simple low-pass filter.
    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (let j = 0; j < ratio; j++) sum += samples[i * ratio + j]!;
      out[i] = Math.round(sum / ratio);
    }
  } else {
    for (let i = 0; i < length; i++) {
      const position = i * ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, samples.length - 1);
      const weight = position - left;
      out[i] = Math.round(samples[left]! * (1 - weight) + samples[right]! * weight);
    }
  }
  return { samples: out, sampleRate: targetRate, channels: 1 };
}

function spreadChannels(mono: PcmAudio, channels: number): PcmAudio {
  const out = new Int16Array(mono.samples.length * channels);
  for (let i = 0; i < mono.samples.length; i++) {
    for (let channel = 0; channel < channels; channel++) out[i * channels + channel] = mono.samples[i]!;
  }
  return { samples: out, sampleRate: mono.sampleRate, channels };
}
