// Procedural audio engine for BaseCraft. Everything is generated on-the-fly
// with the WebAudio API — zero assets, zero extra bytes in the bundle.
//
// The AudioContext is lazy-initialized on first interaction so browsers don't
// block us on autoplay policy. Call `resume()` from a user gesture (pointer
// lock, click, keypress) before expecting sound.

import type { BlockType } from './blocks';

// Per-block-type tone character. Cutoff in Hz feeds a lowpass filter so each
// material sounds physically distinct when broken.
const BREAK_VOICE: Record<BlockType, { cutoff: number; pitch: number }> = {
  base_blue:   { cutoff: 900,  pitch: 180 }, // grass — soft crunch
  deep_blue:   { cutoff: 500,  pitch: 120 }, // dirt — dull thud
  ice_stone:   { cutoff: 2400, pitch: 360 }, // snow/ice — crisp crack
  cyan_wood:   { cutoff: 1400, pitch: 220 }, // wood — mid crack
  sand_blue:   { cutoff: 400,  pitch: 100 }, // sand — soft shh
  royal_brick: { cutoff: 800,  pitch: 150 }, // stone — muted clack
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;

  // Ambient wind nodes (kept around so we can tweak the gain live)
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  private lastFootstep = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.sessionStorage.getItem('bc_muted');
        if (stored === '1') this.muted = true;
      } catch {}
    }
  }

  /** Safe to call many times. Resumes the context after a user gesture. */
  async resume(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtor = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AudioCtor) return;
      this.ctx = new AudioCtor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);
      this.startWind();
    }
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch {}
    }
  }

  get isMuted(): boolean { return this.muted; }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : 1;
    try { window.sessionStorage.setItem('bc_muted', this.muted ? '1' : '0'); } catch {}
    return this.muted;
  }

  playBlockBreak(type: BlockType) {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master || this.muted) return;
    const voice = BREAK_VOICE[type] ?? BREAK_VOICE.base_blue;

    const noise = this.makeNoiseBuffer(0.12);
    const src = ctx.createBufferSource();
    src.buffer = noise;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = voice.cutoff;
    filter.Q.value = 1.0;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    src.connect(filter).connect(gain).connect(master);
    src.start();
    src.stop(ctx.currentTime + 0.12);
  }

  playBlockPlace(type: BlockType) {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master || this.muted) return;
    const voice = BREAK_VOICE[type] ?? BREAK_VOICE.base_blue;

    // Sine body
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(voice.pitch, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(voice.pitch * 0.6, ctx.currentTime + 0.06);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.18, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(oscGain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);

    // Noise transient
    const noise = this.makeNoiseBuffer(0.06);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = voice.cutoff * 0.6;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.1, ctx.currentTime);
    nGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    src.connect(filter).connect(nGain).connect(master);
    src.start();
    src.stop(ctx.currentTime + 0.07);
  }

  playFootstep() {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master || this.muted) return;
    const now = performance.now();
    if (now - this.lastFootstep < 380) return;
    this.lastFootstep = now;

    const noise = this.makeNoiseBuffer(0.05);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600 + Math.random() * 120;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    src.connect(filter).connect(gain).connect(master);
    src.start();
    src.stop(ctx.currentTime + 0.05);
  }

  playJump() {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master || this.muted) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  /** `level` 0..1. Modulates the wind drone intensity. */
  setAmbientWind(level: number) {
    if (!this.windGain || !this.ctx) return;
    const clamped = Math.max(0, Math.min(1, level));
    this.windGain.gain.setTargetAtTime(0.04 * clamped, this.ctx.currentTime, 0.5);
  }

  private startWind() {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master) return;

    // Long, looping pink-ish noise pad. Buffer of ~3 s, slow-modulated filter.
    const buffer = this.makeNoiseBuffer(3, /* pink */ true);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.value = 0; // ramp up via setAmbientWind

    src.connect(filter).connect(gain).connect(master);
    src.start();

    this.windSource = src;
    this.windFilter = filter;
    this.windGain = gain;
  }

  private makeNoiseBuffer(seconds: number, pink = false): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (pink) {
      // Cheap "pink-ish" via a simple running average of white noise.
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.96 + white * 0.04;
        data[i] = last * 3.0;
      }
    } else {
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return buffer;
  }

  dispose() {
    if (this.windSource) {
      try { this.windSource.stop(); } catch {}
      this.windSource.disconnect();
    }
    if (this.windFilter) this.windFilter.disconnect();
    if (this.windGain) this.windGain.disconnect();
    if (this.masterGain) this.masterGain.disconnect();
    if (this.ctx) {
      try { this.ctx.close(); } catch {}
    }
    this.ctx = null;
    this.masterGain = null;
    this.windSource = null;
    this.windFilter = null;
    this.windGain = null;
  }
}

// Singleton — instantiated client-side only.
let _engine: AudioEngine | null = null;
export function getAudio(): AudioEngine {
  if (!_engine) _engine = new AudioEngine();
  return _engine;
}
