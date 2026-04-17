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
  base_blue:      { cutoff: 900,  pitch: 180 }, // grass — soft crunch
  deep_blue:      { cutoff: 500,  pitch: 120 }, // dirt — dull thud
  ice_stone:      { cutoff: 2400, pitch: 360 }, // snow/ice — crisp crack
  cyan_wood:      { cutoff: 1400, pitch: 220 }, // wood — mid crack
  sand_blue:      { cutoff: 400,  pitch: 100 }, // sand — soft shh
  royal_brick:    { cutoff: 800,  pitch: 150 }, // stone — muted clack
  planks:         { cutoff: 1200, pitch: 200 }, // planks — woody snap
  cobblestone:    { cutoff: 700,  pitch: 140 }, // cobblestone — gritty
  crafting_table: { cutoff: 1100, pitch: 190 }, // crafting table — woody
  glass:          { cutoff: 3200, pitch: 500 }, // glass — high shatter
  torch:          { cutoff: 1000, pitch: 250 }, // torch — light snap
  iron_ore:       { cutoff: 600,  pitch: 130 }, // iron ore — deep clank
  diamond_ore:    { cutoff: 2800, pitch: 420 }, // diamond ore — bright clink
  furnace:        { cutoff: 650,  pitch: 120 }, // furnace — heavy thud
  base_block:     { cutoff: 2000, pitch: 300 }, // base block — resonant hum
  leaves:         { cutoff: 1800, pitch: 300 }, // leaves — rustling
  bedrock:        { cutoff: 400,  pitch: 80 },  // bedrock — deep thud
  gravel:         { cutoff: 500,  pitch: 110 }, // gravel — crunchy
  coal_ore:       { cutoff: 650,  pitch: 135 }, // coal ore
  gold_ore:       { cutoff: 700,  pitch: 145 }, // gold ore
  obsidian:       { cutoff: 350,  pitch: 90 },  // obsidian — very deep
  lava:           { cutoff: 300,  pitch: 70 },  // lava — bubbling
  wool:           { cutoff: 2000, pitch: 250 }, // wool — soft
  bricks:         { cutoff: 750,  pitch: 155 }, // bricks
  bookshelf:      { cutoff: 1100, pitch: 195 }, // bookshelf
  ladder:         { cutoff: 1300, pitch: 210 }, // ladder
  chest:          { cutoff: 1000, pitch: 180 }, // chest
  // ---- Tier-gated blocks ----
  bronze_block:   { cutoff: 1800, pitch: 300 }, // bronze — metallic ring
  silver_block:   { cutoff: 2200, pitch: 380 }, // silver — bright ring
  gold_block:     { cutoff: 2600, pitch: 440 }, // gold — brilliant chime
  crystal_block:  { cutoff: 3500, pitch: 520 }, // crystal — high crystalline
  tnt:            { cutoff: 600,  pitch: 150 }, // tnt — papery
  bed:            { cutoff: 800,  pitch: 160 }, // bed — soft fabric
  campfire:       { cutoff: 1000, pitch: 200 }, // campfire — woody crackle
  farmland:       { cutoff: 500,  pitch: 110 }, // farmland — dirt-like
  wheat:          { cutoff: 1800, pitch: 280 }, // wheat — rustling
  oak_door:       { cutoff: 1200, pitch: 200 }, // oak door — woody thud
  trapdoor:       { cutoff: 1100, pitch: 190 }, // trapdoor — wood snap
  brewing_stand:  { cutoff: 700,  pitch: 140 }, // brewing stand — glass clink
  noteblock:      { cutoff: 1400, pitch: 260 }, // noteblock — resonant wood
  jukebox:        { cutoff: 1300, pitch: 240 }, // jukebox — deep wood
  sign:           { cutoff: 1200, pitch: 200 }, // sign — planks
  red_wool:       { cutoff: 2000, pitch: 250 }, // colored wool — soft
  blue_wool:      { cutoff: 2000, pitch: 250 },
  green_wool:     { cutoff: 2000, pitch: 250 },
  yellow_wool:    { cutoff: 2000, pitch: 250 },
  black_wool:     { cutoff: 2000, pitch: 250 },
  // ---- New blocks: Batch 3 ----
  lantern:          { cutoff: 2200, pitch: 350 }, // lantern — glass chime
  fence:            { cutoff: 1200, pitch: 200 }, // fence — woody
  cactus:           { cutoff: 600,  pitch: 160 }, // cactus — soft snap
  pumpkin:          { cutoff: 800,  pitch: 170 }, // pumpkin — hollow thud
  jack_o_lantern:   { cutoff: 900,  pitch: 180 }, // jack o lantern — hollow
  mushroom_red:     { cutoff: 700,  pitch: 140 }, // mushroom — soft pop
  mushroom_brown:   { cutoff: 650,  pitch: 130 }, // mushroom — soft pop
  lever:            { cutoff: 1500, pitch: 280 }, // lever — click
  anvil:            { cutoff: 500,  pitch: 90 },  // anvil — heavy clang
  enchanting_table: { cutoff: 2500, pitch: 400 }, // enchanting — magical hum
  hay_bale:   { cutoff: 800,  pitch: 160 }, // hay bale — soft rustle
  barrel:     { cutoff: 1100, pitch: 190 }, // barrel — woody thud
  beacon:     { cutoff: 3000, pitch: 480 }, // beacon — crystalline hum
  banner:     { cutoff: 1200, pitch: 200 }, // banner — fabric swish
  // ---- Batch 5 blocks ----
  iron_block:       { cutoff: 600,  pitch: 130 }, // iron block — metallic clang
  diamond_block:    { cutoff: 2800, pitch: 420 }, // diamond block — bright ring
  stone_bricks:     { cutoff: 800,  pitch: 150 }, // stone bricks — clack
  mossy_cobblestone:{ cutoff: 700,  pitch: 140 }, // mossy cobble — damp crunch
  clay:             { cutoff: 500,  pitch: 120 }, // clay — wet thud
  terracotta:       { cutoff: 750,  pitch: 155 }, // terracotta — earthy crack
  soul_sand:        { cutoff: 400,  pitch: 100 }, // soul sand — eerie muffled
  glowstone:        { cutoff: 2200, pitch: 380 }, // glowstone — bright shatter
  prismarine:       { cutoff: 1600, pitch: 280 }, // prismarine — watery crack
  sea_lantern:      { cutoff: 2400, pitch: 400 }, // sea lantern — watery shatter
  nether_bricks:    { cutoff: 650,  pitch: 130 }, // nether bricks — dark clack
  end_stone:        { cutoff: 900,  pitch: 170 }, // end stone — hollow
  nether_portal:    { cutoff: 1800, pitch: 320 }, // nether portal — warped hum
  redstone_lamp:    { cutoff: 1500, pitch: 260 }, // redstone lamp — warm click
  sponge:           { cutoff: 1000, pitch: 200 }, // sponge — squelch
  melon:            { cutoff: 800,  pitch: 170 }, // melon — wet crunch
  // ---- Batch 9: Biome blocks ----
  moss_block:       { cutoff: 700,  pitch: 150 }, // moss — soft squish
  vine:             { cutoff: 1200, pitch: 250 }, // vine — leafy snap
  lily_pad:         { cutoff: 1100, pitch: 240 }, // lily pad — light snap
  mud:              { cutoff: 400,  pitch: 100 }, // mud — deep squelch
  birch_wood:       { cutoff: 800,  pitch: 160 }, // birch — light wood crack
  birch_leaves:     { cutoff: 1600, pitch: 280 }, // birch leaves — rustle
  dark_oak_wood:    { cutoff: 600,  pitch: 130 }, // dark oak — heavy thud
  dark_oak_leaves:  { cutoff: 1500, pitch: 270 }, // dark oak leaves — rustle
  water:            { cutoff: 1400, pitch: 300 }, // water — splash
  sugar_cane:       { cutoff: 1300, pitch: 260 }, // sugar cane — snap
  packed_ice:       { cutoff: 2600, pitch: 380 }, // packed ice — crack
  snow_block:       { cutoff: 2200, pitch: 340 }, // snow block — crunch
  emerald_ore:      { cutoff: 2000, pitch: 300 }, // emerald ore — crystalline
  copper_ore:       { cutoff: 1600, pitch: 240 }, // copper ore — metallic tap
  amethyst:         { cutoff: 2800, pitch: 400 }, // amethyst — chime
  deepslate:        { cutoff: 900,  pitch: 140 }, // deepslate — heavy crack
  calcite:          { cutoff: 1800, pitch: 280 }, // calcite — crisp crack
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private volume = 1.0; // 0..1

  // Ambient wind nodes (kept around so we can tweak the gain live)
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  // Procedural music
  private musicGain: GainNode | null = null;
  private musicInterval: ReturnType<typeof setInterval> | null = null;

  private lastFootstep = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.sessionStorage.getItem('bc_muted');
        if (stored === '1') this.muted = true;
        const storedVol = window.sessionStorage.getItem('bc_volume');
        if (storedVol) this.volume = Math.max(0, Math.min(1, parseFloat(storedVol)));
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
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.startWind();
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch {}
    }
  }

  get isMuted(): boolean { return this.muted; }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.volume;
    try { window.sessionStorage.setItem('bc_muted', this.muted ? '1' : '0'); } catch {}
    return this.muted;
  }

  getVolume(): number { return this.volume; }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.value = this.volume;
    }
    try { window.sessionStorage.setItem('bc_volume', String(this.volume)); } catch {}
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

  playFootstep(terrain?: string) {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master || this.muted) return;
    const now = performance.now();
    if (now - this.lastFootstep < 380) return;
    this.lastFootstep = now;

    // Terrain-specific footstep character
    let cutoff = 600;
    let vol = 0.08;
    let duration = 0.05;
    switch (terrain) {
      case 'sand_blue':   cutoff = 350; vol = 0.06; duration = 0.07; break; // soft sandy
      case 'ice_stone':
      case 'packed_ice':
      case 'snow_block':  cutoff = 1200; vol = 0.07; duration = 0.04; break; // crisp snow
      case 'base_blue':   cutoff = 700; vol = 0.07; duration = 0.05; break; // grass
      case 'deep_blue':
      case 'mud':         cutoff = 400; vol = 0.09; duration = 0.06; break; // squelchy dirt/mud
      case 'royal_brick':
      case 'cobblestone':
      case 'stone_bricks':cutoff = 900; vol = 0.1; duration = 0.03; break; // hard stone
      case 'planks':      cutoff = 1000; vol = 0.09; duration = 0.04; break; // wooden
      case 'water':       cutoff = 500; vol = 0.06; duration = 0.08; break; // splashy
      default:            cutoff = 600 + Math.random() * 120; break;
    }

    const noise = this.makeNoiseBuffer(duration);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff + Math.random() * 80;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration * 0.8);
    src.connect(filter).connect(gain).connect(master);
    src.start();
    src.stop(ctx.currentTime + duration);
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

  private startMusic() {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master) return;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.025;
    this.musicGain.connect(master);

    // Multiple Minecraft-inspired ambient melodies (pentatonic, calm)
    const melodies = [
      // Melody 1: C418-style calm (C major pentatonic)
      [261.63, 329.63, 392.00, 329.63, 440.00, 392.00, 329.63, 261.63],
      // Melody 2: Ethereal (A minor pentatonic)
      [220.00, 261.63, 329.63, 392.00, 329.63, 261.63, 220.00, 196.00],
      // Melody 3: Adventurous (G major pentatonic)
      [196.00, 246.94, 293.66, 329.63, 392.00, 329.63, 293.66, 246.94],
      // Melody 4: Twilight (D minor pentatonic)
      [293.66, 349.23, 392.00, 440.00, 523.25, 440.00, 392.00, 349.23],
      // Melody 5: Mysterious (E phrygian)
      [164.81, 174.61, 196.00, 220.00, 246.94, 220.00, 196.00, 164.81],
    ];

    let melodyIndex = Math.floor(Math.random() * melodies.length);
    let noteIndex = 0;

    const playNote = () => {
      if (!this.ctx || !this.musicGain) return;
      const melody = melodies[melodyIndex];
      const freq = melody[noteIndex % melody.length];
      noteIndex++;

      // Switch melody after full cycle (with silence gap)
      if (noteIndex % melody.length === 0) {
        if (Math.random() < 0.3) {
          // 30% chance of silence between melodies
          noteIndex++;
          return;
        }
        melodyIndex = (melodyIndex + 1) % melodies.length;
      }

      // Dual oscillator for richer sound (detuned sine + triangle)
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = freq;

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = freq * 2; // octave up, quieter
      osc2.detune.value = 5; // slight detune for warmth

      const noteGain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      noteGain.gain.setValueAtTime(0, now);
      noteGain.gain.linearRampToValueAtTime(0.8, now + 0.4);
      noteGain.gain.setValueAtTime(0.8, now + 1.5);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

      const osc2Gain = this.ctx.createGain();
      osc2Gain.gain.value = 0.15; // much quieter overtone

      // Reverb-like delay
      const delay = this.ctx.createDelay(0.5);
      delay.delayTime.value = 0.25;
      const delayGain = this.ctx.createGain();
      delayGain.gain.value = 0.15;

      osc1.connect(noteGain);
      osc2.connect(osc2Gain).connect(noteGain);
      noteGain.connect(this.musicGain!);
      noteGain.connect(delay).connect(delayGain).connect(this.musicGain!);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 2.8);
      osc2.stop(now + 2.8);
    };

    playNote();
    this.musicInterval = setInterval(playNote, 2500);
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

  /** Play a cave drip sound — water droplet */
  playCaveDrip() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800 + Math.random() * 400, now);
    osc.frequency.exponentialRampToValueAtTime(200 + Math.random() * 100, now + 0.15);
    gain.gain.setValueAtTime(0.04 + Math.random() * 0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain).connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /** Play a bird chirp — short tonal pip */
  playBirdChirp() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const chirpCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < chirpCount; i++) {
      const t = now + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const baseFreq = 1200 + Math.random() * 1600;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * (0.8 + Math.random() * 0.4), t + 0.08);
      gain.gain.setValueAtTime(0.02, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain).connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  /** Play a wind gust sound */
  playWindGust() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const buf = this.makeNoiseBuffer(1.5, true);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.linearRampToValueAtTime(600, now + 0.5);
    filter.frequency.linearRampToValueAtTime(200, now + 1.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.3);
    gain.gain.linearRampToValueAtTime(0, now + 1.5);
    src.connect(filter).connect(gain).connect(this.masterGain!);
    src.start(now);
    src.stop(now + 1.5);
  }

  /** Play XP orb pickup sound */
  playXPPickup() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** Play level-up fanfare */
  playLevelUp() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      gain.gain.setValueAtTime(0.06, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
      osc.connect(gain).connect(this.masterGain!);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
  }

  /** Achievement unlock fanfare */
  playAchievement() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Triumphant ascending notes: C5 → E5 → G5 → C6 (faster, brighter)
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.04, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
      osc.connect(gain).connect(this.masterGain!);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.25);
    });
    // Extra shimmer on last note
    const shimmer = ctx.createOscillator();
    const sGain = ctx.createGain();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(2093, now + 0.32); // C7
    sGain.gain.setValueAtTime(0.03, now + 0.32);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    shimmer.connect(sGain).connect(this.masterGain!);
    shimmer.start(now + 0.32);
    shimmer.stop(now + 0.7);
  }

  /** Kill streak announcement sound */
  playKillStreak() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Aggressive double-hit sound
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.15);
    // Second hit
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(600, now + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
    gain2.gain.setValueAtTime(0.05, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc2.connect(gain2).connect(this.masterGain!);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.25);
  }

  /** Play eating/munching sound */
  playEat() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // 3 quick crunchy bites
    for (let i = 0; i < 3; i++) {
      const buf = this.makeNoiseBuffer(0.08, true);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400 + Math.random() * 200, now + i * 0.12);
      filter.Q.setValueAtTime(2, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.08);
      src.connect(filter).connect(gain).connect(this.masterGain!);
      src.start(now + i * 0.12);
      src.stop(now + i * 0.12 + 0.08);
    }
  }

  /** Play mob hurt sound */
  playMobHurt() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.15);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** Play anvil clang */
  playAnvil() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain).connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** Play chest open/close */
  playChest() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(350, now + 0.1);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** Play thunder rumble */
  playThunder() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Low rumble with noise
    const buf = this.makeNoiseBuffer(1.2, true);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(150, now);
    filter.frequency.linearRampToValueAtTime(80, now + 1.0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    src.connect(filter).connect(gain).connect(this.masterGain!);
    src.start(now);
    src.stop(now + 1.2);
  }

  /** Play splash sound */
  playSplash() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const buf = this.makeNoiseBuffer(0.3, true);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.setValueAtTime(1, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    src.connect(filter).connect(gain).connect(this.masterGain!);
    src.start(now);
    src.stop(now + 0.3);
  }

  dispose() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    if (this.musicGain) {
      this.musicGain.disconnect();
      this.musicGain = null;
    }
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
