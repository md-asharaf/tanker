import { secureRandom } from '../utils/math';

export type SoundName =
  | 'fire'
  | 'impact'
  | 'explosion'
  | 'correct'
  | 'wrong'
  | 'combo'
  | 'uiClick'
  | 'gameStart'
  | 'gameComplete';

class AudioManagerClass {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;

  private muted = false;
  private bgmEnabled = true;
  private bgmPlaying = false;
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      const storedMute = localStorage.getItem('tankTrivia_muted');
      if (storedMute === 'true') this.muted = true;
      const storedBgm = localStorage.getItem('tankTrivia_bgm');
      if (storedBgm === 'false') this.bgmEnabled = false;

      const unlock = () => {
        this.unlockAudio();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
    }
  }

  private unlockAudio(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.setupGains();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.bgmEnabled && !this.bgmPlaying && !this.muted) {
      this.startBgm();
    }
  }

  private setupGains(): void {
    if (!this.ctx) return;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1.0, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.22, this.ctx.currentTime);
    this.bgmGain.connect(this.masterGain);
  }

  private getCtx(): AudioContext | null {
    if (!this.ctx) this.unlockAudio();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem('tankTrivia_muted', String(muted));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 1.0, this.ctx.currentTime);
    }
    if (muted) {
      this.stopBgm();
    } else if (this.bgmEnabled) {
      this.startBgm();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setBgmEnabled(enabled: boolean): void {
    this.bgmEnabled = enabled;
    localStorage.setItem('tankTrivia_bgm', String(enabled));
    if (enabled && !this.muted) {
      this.startBgm();
    } else {
      this.stopBgm();
    }
  }

  isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  // ── Procedural Chiptune/Arcade BGM Engine ────────────────────────
  startBgm(): void {
    if (this.bgmPlaying || this.muted || !this.bgmEnabled) return;
    const ctx = this.getCtx();
    if (!ctx) return;

    this.bgmPlaying = true;
    this.bgmStep = 0;

    // Upbeat Pentatonic Arcade Bass & Arp notes
    const bassNotes = [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83]; // A2, C3, D3, E3
    const leadNotes = [
      440, 523.25, 659.25, 587.33, 659.25, 783.99, 880, 783.99,
      659.25, 523.25, 587.33, 440, 523.25, 659.25, 587.33, 523.25,
    ];

    const stepInterval = 140; // ~107 BPM 16th groove

    const tick = () => {
      if (!this.bgmPlaying || !this.ctx || this.muted) return;
      const t = this.ctx.currentTime;

      // 1. Bassline hit on every 2nd step
      if (this.bgmStep % 2 === 0) {
        const bIdx = (Math.floor(this.bgmStep / 2)) % bassNotes.length;
        const bFreq = bassNotes[bIdx];
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        const bFilter = this.ctx.createBiquadFilter();

        bOsc.type = 'triangle';
        bOsc.frequency.setValueAtTime(bFreq, t);

        bFilter.type = 'lowpass';
        bFilter.frequency.setValueAtTime(280, t);

        bGain.gain.setValueAtTime(0.18, t);
        bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        bOsc.connect(bFilter);
        bFilter.connect(bGain);
        if (this.bgmGain) bGain.connect(this.bgmGain);

        bOsc.start(t);
        bOsc.stop(t + 0.22);
      }

      // 2. Lead Arpeggio Melody
      const lIdx = this.bgmStep % leadNotes.length;
      const lFreq = leadNotes[lIdx];
      const lOsc = this.ctx.createOscillator();
      const lGain = this.ctx.createGain();

      lOsc.type = 'sine';
      lOsc.frequency.setValueAtTime(lFreq, t);

      lGain.gain.setValueAtTime(0.08, t);
      lGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      lOsc.connect(lGain);
      if (this.bgmGain) lGain.connect(this.bgmGain);

      lOsc.start(t);
      lOsc.stop(t + 0.12);

      this.bgmStep = (this.bgmStep + 1) % 64;
      this.bgmTimer = window.setTimeout(tick, stepInterval);
    };

    this.bgmTimer = window.setTimeout(tick, stepInterval);
  }

  stopBgm(): void {
    this.bgmPlaying = false;
    if (this.bgmTimer !== null) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  // ── Heavy Punchy Cannon Fire ─────────────────────────────────────
  playFire(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;

    // 1. Noise muzzle crack
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (secureRandom() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + 0.35);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(2.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    // 2. Sub-bass kick punch
    const kick = ctx.createOscillator();
    const kickGain = ctx.createGain();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(160, t);
    kick.frequency.exponentialRampToValueAtTime(32, t + 0.28);

    kickGain.gain.setValueAtTime(2.2, t);
    kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    kick.connect(kickGain);
    if (this.sfxGain) kickGain.connect(this.sfxGain);
    kick.start(t);
    kick.stop(t + 0.28);

    src.connect(filter);
    filter.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.4);
  }

  // ── Terrain Impact Thud ──────────────────────────────────────────
  playImpact(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;

    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (secureRandom() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    src.connect(filter);
    filter.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.3);
  }

  // ── Cinematic Tank Explosion ─────────────────────────────────────
  playExplosion(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;

    // 1. Noise burst & crackling debris
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.1), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (secureRandom() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.2));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(60, t + 1.0);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(3.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);

    src.connect(filter);
    filter.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 1.1);

    // 2. Sub-bass seismic rumble
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(140, t);
    subOsc.frequency.exponentialRampToValueAtTime(24, t + 0.7);

    subGain.gain.setValueAtTime(1.8, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

    subOsc.connect(subGain);
    if (this.sfxGain) subGain.connect(this.sfxGain);
    subOsc.start(t);
    subOsc.stop(t + 0.7);
  }

  // ── Correct Answer Melody Fanfare ────────────────────────────────
  playCorrect(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      if (this.sfxGain) gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }

  // ── Combo Multiplier Chime ───────────────────────────────────────
  playCombo(multiplier: number = 2): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const baseFreq = 587.33 * Math.min(2.0, 1.0 + (multiplier - 1) * 0.15);
    const freqs = [baseFreq, baseFreq * 1.25, baseFreq * 1.5];
    freqs.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      if (this.sfxGain) gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  // ── Wrong Answer Buzzer ──────────────────────────────────────────
  playWrong(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.linearRampToValueAtTime(110, t + 0.32);
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  // ── UI Click ─────────────────────────────────────────────────────
  playUiClick(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 900;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  // ── Game Start Fanfare ───────────────────────────────────────────
  playGameStart(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const freqs = [392, 523.25, 659.25, 783.99]; // G4 C5 E5 G5
    freqs.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      if (this.sfxGain) gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  // ── Game Complete Celebration ────────────────────────────────────
  playGameComplete(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const seq = [523, 659, 784, 659, 784, 1047, 1318];
    seq.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.32, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      if (this.sfxGain) gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  play(name: SoundName): void {
    switch (name) {
      case 'fire': return this.playFire();
      case 'impact': return this.playImpact();
      case 'explosion': return this.playExplosion();
      case 'correct': return this.playCorrect();
      case 'wrong': return this.playWrong();
      case 'combo': return this.playCombo();
      case 'uiClick': return this.playUiClick();
      case 'gameStart': return this.playGameStart();
      case 'gameComplete': return this.playGameComplete();
    }
  }


  startEngine(): void {
    if (this.bgmEnabled && !this.muted) {
      this.startBgm();
    }
  }

  stopEngine(): void {
    // Engine sound placeholder
  }
}

export const AudioManager = new AudioManagerClass();
