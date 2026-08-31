// ─────────────────────────────────────────────────────────────────
//  AudioManager — Web Audio API synthesized arcade sounds
//  Auto-unlocks on first user interaction (click / keydown / touch)
// ─────────────────────────────────────────────────────────────────

type SoundName =
  | 'fire'
  | 'impact'
  | 'explosion'
  | 'correct'
  | 'wrong'
  | 'uiClick'
  | 'gameStart'
  | 'gameComplete'
  | 'engine';

class AudioManagerClass {
  private ctx: AudioContext | null = null;
  private muted = false;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineRunning = false;
  private unlocked = false;

  constructor() {
    // Setup universal user-gesture unlock listener
    if (typeof window !== 'undefined') {
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
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        this.unlocked = true;
      }).catch(() => {});
    } else {
      this.unlocked = true;
    }
  }

  private getCtx(): AudioContext | null {
    if (!this.ctx) {
      this.unlockAudio();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted && this.engineRunning) this.stopEngine();
  }

  // ── Cannon fire ─────────────────────────────────────────────────
  playFire(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Heavy low punch
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.45), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.07));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(2.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    // Tonal kick oscillator
    const kick = ctx.createOscillator();
    const kickGain = ctx.createGain();
    kick.frequency.setValueAtTime(140, t);
    kick.frequency.exponentialRampToValueAtTime(35, t + 0.25);
    kickGain.gain.setValueAtTime(1.5, t);
    kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    kick.connect(kickGain);
    kickGain.connect(ctx.destination);
    kick.start(t);
    kick.stop(t + 0.25);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.45);
  }

  // ── Terrain impact ──────────────────────────────────────────────
  playImpact(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;

    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.35), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.35);
  }

  // ── Tank explosion ──────────────────────────────────────────────
  playExplosion(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;

    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.9), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.16));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 450;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(3.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.9);
  }

  // ── Correct answer fanfare ──────────────────────────────────────
  playCorrect(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.1;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  // ── Wrong answer buzz ───────────────────────────────────────────
  playWrong(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.linearRampToValueAtTime(110, t + 0.35);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  // ── UI click ────────────────────────────────────────────────────
  playUiClick(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 850;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // ── Game start ──────────────────────────────────────────────────
  playGameStart(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const freqs = [392, 523.25, 659.25, 783.99]; // G4 C5 E5 G5
    freqs.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  // ── Game complete ───────────────────────────────────────────────
  playGameComplete(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const seq = [523, 659, 784, 659, 784, 1047];
    seq.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  // ── Engine hum loop ─────────────────────────────────────────────
  startEngine(): void {
    if (this.muted || this.engineRunning) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    this.engineRunning = true;

    try {
      this.engineOsc = ctx.createOscillator();
      this.engineGain = ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 45;
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(ctx.destination);
      this.engineOsc.start();
      this.engineGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.4);
    } catch {
      this.engineRunning = false;
    }
  }

  stopEngine(): void {
    if (!this.engineRunning) return;
    this.engineRunning = false;
    if (this.engineGain && this.ctx) {
      try {
        this.engineGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
      } catch {}
    }
    setTimeout(() => {
      try {
        this.engineOsc?.stop();
      } catch {}
      this.engineOsc = null;
      this.engineGain = null;
    }, 250);
  }

  setEngineIntensity(throttle: number): void {
    if (!this.engineRunning || !this.engineOsc || !this.engineGain || this.muted || !this.ctx) return;
    const freq = 45 + throttle * 30;
    try {
      this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
      this.engineGain.gain.setTargetAtTime(0.03 + throttle * 0.05, this.ctx.currentTime, 0.1);
    } catch {}
  }

  play(name: SoundName): void {
    switch (name) {
      case 'fire': return this.playFire();
      case 'impact': return this.playImpact();
      case 'explosion': return this.playExplosion();
      case 'correct': return this.playCorrect();
      case 'wrong': return this.playWrong();
      case 'uiClick': return this.playUiClick();
      case 'gameStart': return this.playGameStart();
      case 'gameComplete': return this.playGameComplete();
    }
  }
}

export const AudioManager = new AudioManagerClass();
