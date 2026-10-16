import { describe, expect, it } from "vitest";
import { convertPcm, encodeWav, pcmFromBuffer, pcmFromFloat32 } from "../../src/infrastructure/audio/pcm.js";

describe("pcm", () => {
  it("downmixes 48 kHz stereo to 16 kHz mono", () => {
    const stereo = new Int16Array([100, 300, 100, 300, 100, 300, 400, 600, 400, 600, 400, 600]);
    const mono = convertPcm({ samples: stereo, sampleRate: 48_000, channels: 2 }, { sampleRate: 16_000, channels: 1 });
    expect([...mono.samples]).toEqual([200, 500]);
  });

  it("upsamples 24 kHz mono to 48 kHz stereo", () => {
    const out = convertPcm(pcmFromFloat32(new Float32Array([0, 0.5]), 24_000), { sampleRate: 48_000, channels: 2 });
    expect(out.channels).toBe(2);
    expect(out.samples).toHaveLength(8);
  });

  it("reads a Buffer at an odd byte offset", () => {
    const pool = Buffer.alloc(5);
    pool.writeInt16LE(1234, 1);
    pool.writeInt16LE(-42, 3);
    const audio = pcmFromBuffer(pool.subarray(1), { sampleRate: 16_000, channels: 1 });
    expect([...audio.samples]).toEqual([1234, -42]);
  });

  it("writes a valid WAV header", () => {
    const wav = encodeWav({ samples: new Int16Array(10), sampleRate: 16_000, channels: 1 });
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.readUInt32LE(40)).toBe(20);
  });
});
