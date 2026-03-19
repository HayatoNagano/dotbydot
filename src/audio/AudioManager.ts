/**
 * Web Audio API based procedural audio manager.
 * All sounds are synthesized — no external audio files needed.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private initialized = false;

  /** Must be called from a user gesture (click/keydown) to unlock audio */
  init(): void {
    if (this.initialized) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(this.ctx.destination);
    this.initialized = true;
  }

  get ready(): boolean {
    return this.initialized && this.ctx !== null;
  }

  get context(): AudioContext {
    return this.ctx!;
  }

  get master(): GainNode {
    return this.masterGain!;
  }

  setMasterVolume(v: number): void {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  // ─── Heartbeat (terror radius) ───

  private heartbeatTimeout: number | null = null;
  private heartbeatPlaying = false;

  /** Play heartbeat at given intensity (0-1). 0 stops it. */
  updateHeartbeat(intensity: number): void {
    if (!this.ready) return;

    if (intensity <= 0) {
      this.heartbeatPlaying = false;
      return;
    }

    if (this.heartbeatPlaying) return;
    this.heartbeatPlaying = true;
    this.playHeartbeatLoop(intensity);
  }

  private playHeartbeatLoop(intensity: number): void {
    if (!this.heartbeatPlaying || !this.ready) return;

    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // Double beat: "lub-dub"
    this.playHeartbeatBeat(now, intensity, 60);
    this.playHeartbeatBeat(now + 0.12, intensity * 0.7, 50);

    // Interval gets faster with higher intensity
    const interval = 300 + (1 - intensity) * 700; // 300ms-1000ms
    this.heartbeatTimeout = window.setTimeout(() => {
      this.playHeartbeatLoop(intensity);
    }, interval);
  }

  private playHeartbeatBeat(time: number, volume: number, freq: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume * 0.4, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  stopHeartbeat(): void {
    this.heartbeatPlaying = false;
    if (this.heartbeatTimeout !== null) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  // ─── Sound Effects ───

  /** Killer attack / slash sound */
  playAttack(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // Noise burst for slash
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Bandpass filter for "swoosh"
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(500, now + 0.15);
    filter.Q.value = 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start(now);
    noise.stop(now + 0.2);
  }

  /** Survivor hit / damage taken */
  playHit(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // Low thud
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.3);

    // Pain noise
    const bufLen = ctx.sampleRate * 0.1;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) * 0.3;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.3, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    src.connect(g2);
    g2.connect(this.master);
    src.start(now);
    src.stop(now + 0.15);
  }

  /** Generator repair tick (mechanical clicking) */
  playRepairTick(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800 + Math.random() * 400, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /** Generator completed — rising chime */
  playGeneratorComplete(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const t = now + i * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  /** Skill check — good */
  playSkillCheckGood(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** Skill check — great */
  playSkillCheckGreat(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    [880, 1100].forEach((freq, i) => {
      const t = now + i * 0.08;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  /** Skill check — miss (dissonant buzz) */
  playSkillCheckMiss(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(150, now + 0.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** Pallet drop — heavy wood thud */
  playPalletDrop(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // Low impact
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.25);

    // Wood crack noise
    const bufLen = ctx.sampleRate * 0.08;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1500;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.3, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    src.connect(filter);
    filter.connect(g2);
    g2.connect(this.master);
    src.start(now);
    src.stop(now + 0.1);
  }

  /** Pallet break — crunch */
  playPalletBreak(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const bufLen = ctx.sampleRate * 0.3;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.3);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + 0.35);
  }

  /** Killer stun — ringing */
  playStun(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    [600, 750, 900].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.8);
    });
  }

  /** Locker enter/exit — metal creak */
  playLocker(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(200, now + 0.15);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /** Hook survivor — metallic pierce */
  playHook(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // Metal pierce
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.3);

    // Low thud
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(80, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(30, now + 0.25);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.3, now + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc2.connect(g2);
    g2.connect(this.master);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.3);
  }

  /** Trap trigger — snap */
  playTrapSnap(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Axe throw — whoosh */
  playAxeThrow(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const bufLen = ctx.sampleRate * 0.2;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const t = i / bufLen;
      d[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI) * 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(1000, now + 0.2);
    filter.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + 0.25);
  }

  /** Exit gate power on — alarm siren */
  playGatePowered(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.3;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.linearRampToValueAtTime(880, t + 0.15);
      osc.frequency.linearRampToValueAtTime(440, t + 0.3);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.setValueAtTime(0.15, t + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  /** Survivor escape — victory jingle */
  playEscape(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const notes = [523, 659, 784, 1047, 1319]; // C E G C' E'
    notes.forEach((freq, i) => {
      const t = now + i * 0.15;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  /** Sacrifice complete — dark descending tone */
  playSacrifice(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const notes = [440, 370, 311, 261, 220];
    notes.forEach((freq, i) => {
      const t = now + i * 0.2;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  /** Ability activate — power-up whoosh */
  playAbilityActivate(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** Menu select — click */
  playMenuSelect(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 660;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  /** Menu cursor move — soft tick */
  playMenuMove(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 440;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  // ─── Campfire crackling (title screen) ───

  private campfireNodes: AudioNode[] = [];
  private campfirePlaying = false;
  private campfireCrackTimeout: number | null = null;

  startCampfire(): void {
    if (!this.ready || this.campfirePlaying) return;
    this.campfirePlaying = true;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const nodes: AudioNode[] = [];

    // Base crackle: filtered noise loop (continuous low rumble of fire)
    const noiseLen = 2;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) {
      nd[i] = (Math.random() * 2 - 1);
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    // Bandpass to get crackling character
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 3000;
    noiseFilter.Q.value = 0.8;

    // Amplitude modulation for flickering effect
    const ampLfo = ctx.createOscillator();
    ampLfo.type = 'sine';
    ampLfo.frequency.value = 1.5;
    const ampLfoGain = ctx.createGain();
    ampLfoGain.gain.value = 0.01;
    const baseGain = ctx.createGain();
    baseGain.gain.value = 0.02;
    ampLfo.connect(ampLfoGain);
    ampLfoGain.connect(baseGain.gain);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(baseGain);
    baseGain.connect(this.master);

    noiseSrc.start(now);
    ampLfo.start(now);
    nodes.push(noiseSrc, ampLfo);

    // Low rumble of fire
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.value = 60;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 100;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.008;
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(this.master);
    rumble.start(now);
    nodes.push(rumble);

    this.campfireNodes = nodes;

    // Start random crack/pop loop
    this.scheduleCampfireCrack();
  }

  private scheduleCampfireCrack(): void {
    if (!this.campfirePlaying || !this.ready) return;
    const ctx = this.ctx!;

    // Random interval between cracks: 200ms - 800ms
    const interval = 200 + Math.random() * 600;
    this.campfireCrackTimeout = window.setTimeout(() => {
      if (!this.campfirePlaying || !this.ready) return;
      const now = ctx.currentTime;

      // Short noise burst = "pop" or "crack"
      const crackLen = Math.floor(ctx.sampleRate * (0.01 + Math.random() * 0.03));
      const crackBuf = ctx.createBuffer(1, crackLen, ctx.sampleRate);
      const cd = crackBuf.getChannelData(0);
      for (let i = 0; i < crackLen; i++) {
        cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / crackLen, 2);
      }
      const crackSrc = ctx.createBufferSource();
      crackSrc.buffer = crackBuf;

      const crackFilter = ctx.createBiquadFilter();
      crackFilter.type = 'highpass';
      crackFilter.frequency.value = 1000 + Math.random() * 3000;

      const crackGain = ctx.createGain();
      const vol = 0.04 + Math.random() * 0.06;
      crackGain.gain.setValueAtTime(vol, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      crackSrc.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(this.master);
      crackSrc.start(now);
      crackSrc.stop(now + 0.06);

      this.scheduleCampfireCrack();
    }, interval);
  }

  stopCampfire(): void {
    this.campfirePlaying = false;
    for (const node of this.campfireNodes) {
      try {
        if (node instanceof OscillatorNode) node.stop();
        else if (node instanceof AudioBufferSourceNode) node.stop();
      } catch { /* already stopped */ }
    }
    this.campfireNodes = [];
    if (this.campfireCrackTimeout !== null) {
      clearTimeout(this.campfireCrackTimeout);
      this.campfireCrackTimeout = null;
    }
  }

  // ─── Menu BGM (DbD-style dark atmospheric) ───

  private menuNodes: AudioNode[] = [];
  private menuPlaying = false;

  /** Start dark atmospheric menu music (piano + choir + drone) */
  startMenuBGM(): void {
    if (!this.ready || this.menuPlaying) return;
    this.menuPlaying = true;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const nodes: AudioNode[] = [];

    // --- Layer 1: Deep sub-bass drone ---
    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 36.7; // D1
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 120;
    droneFilter.Q.value = 4;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.08;
    // Slow LFO on drone pitch
    const droneLfo = ctx.createOscillator();
    droneLfo.type = 'sine';
    droneLfo.frequency.value = 0.15;
    const droneLfoGain = ctx.createGain();
    droneLfoGain.gain.value = 2;
    droneLfo.connect(droneLfoGain);
    droneLfoGain.connect(drone.frequency);
    drone.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(this.master);
    drone.start(now);
    droneLfo.start(now);
    nodes.push(drone, droneLfo);

    // --- Layer 2: Eerie pad (minor chord, detuned saws) ---
    const padNotes = [146.8, 174.6, 220]; // D3, F3, A3 (Dm)
    padNotes.forEach((freq, i) => {
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = freq;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = freq * 1.003; // slight detune
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 400;
      padFilter.Q.value = 1;
      // Slow filter sweep
      const filterLfo = ctx.createOscillator();
      filterLfo.type = 'sine';
      filterLfo.frequency.value = 0.08 + i * 0.02;
      const filterLfoGain = ctx.createGain();
      filterLfoGain.gain.value = 150;
      filterLfo.connect(filterLfoGain);
      filterLfoGain.connect(padFilter.frequency);

      const padGain = ctx.createGain();
      padGain.gain.value = 0.025;
      osc1.connect(padFilter);
      osc2.connect(padFilter);
      padFilter.connect(padGain);
      padGain.connect(this.master);
      osc1.start(now);
      osc2.start(now);
      filterLfo.start(now);
      nodes.push(osc1, osc2, filterLfo);
    });

    // --- Layer 3: "Choir" (sine harmonics with vibrato) ---
    const choirNotes = [293.7, 349.2]; // D4, F4
    choirNotes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Vibrato
      const vib = ctx.createOscillator();
      vib.type = 'sine';
      vib.frequency.value = 4.5 + i * 0.5;
      const vibGain = ctx.createGain();
      vibGain.gain.value = 3;
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);

      const choirGain = ctx.createGain();
      choirGain.gain.value = 0;
      // Fade in/out breathing
      const breathLfo = ctx.createOscillator();
      breathLfo.type = 'sine';
      breathLfo.frequency.value = 0.1 + i * 0.03;
      const breathGain = ctx.createGain();
      breathGain.gain.value = 0.03;
      breathLfo.connect(breathGain);
      breathGain.connect(choirGain.gain);

      osc.connect(choirGain);
      choirGain.connect(this.master);
      osc.start(now);
      vib.start(now);
      breathLfo.start(now);
      nodes.push(osc, vib, breathLfo);
    });

    // --- Layer 4: Slow piano-like notes (plucked sine) ---
    this.startMenuPianoLoop(nodes);

    // --- Layer 5: Tension riser (very quiet high-pitched noise) ---
    const noiseLen = 4;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) {
      nd[i] = (Math.random() * 2 - 1) * 0.5;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 6000;
    noiseFilter.Q.value = 3;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.012;
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.master);
    noiseSrc.start(now);
    nodes.push(noiseSrc);

    this.menuNodes = nodes;
  }

  private menuPianoTimeout: number | null = null;

  private startMenuPianoLoop(nodes: AudioNode[]): void {
    if (!this.menuPlaying || !this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // Dark minor pattern: D3, A3, F3, E3, D3, Bb2, A2
    const pattern = [146.8, 220, 174.6, 164.8, 146.8, 116.5, 110];
    const noteIdx = Math.floor(Math.random() * pattern.length);
    const freq = pattern[noteIdx];

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    // Quick attack, slow decay — piano-like
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 3);

    // Add a second harmonic for richness
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.02, now + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    osc.connect(gain);
    gain.connect(this.master);
    osc2.connect(gain2);
    gain2.connect(this.master);
    osc.start(now);
    osc.stop(now + 3.5);
    osc2.start(now);
    osc2.stop(now + 2);

    // Next note in 1.5-3.5 seconds
    const interval = 1500 + Math.random() * 2000;
    this.menuPianoTimeout = window.setTimeout(() => {
      this.startMenuPianoLoop(nodes);
    }, interval);
  }

  stopMenuBGM(): void {
    this.menuPlaying = false;
    for (const node of this.menuNodes) {
      try {
        if (node instanceof OscillatorNode) node.stop();
        else if (node instanceof AudioBufferSourceNode) node.stop();
      } catch { /* already stopped */ }
    }
    this.menuNodes = [];
    if (this.menuPianoTimeout !== null) {
      clearTimeout(this.menuPianoTimeout);
      this.menuPianoTimeout = null;
    }
  }

  // ─── Ambient BGM ───

  private ambientNodes: AudioNode[] = [];
  private ambientGain: GainNode | null = null;
  private ambientPlaying = false;

  /** Start dark ambient drone BGM */
  startAmbient(): void {
    if (!this.ready || this.ambientPlaying) return;
    this.ambientPlaying = true;
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];

    // Layer 1: Low drone (A1)
    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 55;
    const droneLfo = ctx.createOscillator();
    droneLfo.type = 'sine';
    droneLfo.frequency.value = 0.3;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 5;
    droneLfo.connect(lfoGain);
    lfoGain.connect(drone.frequency);
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 200;
    droneFilter.Q.value = 3;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.06;
    drone.connect(droneFilter);
    droneFilter.connect(droneGain);

    // Layer 2: Quiet high-frequency tension
    const tension = ctx.createOscillator();
    tension.type = 'sine';
    tension.frequency.value = 1200;
    const tensionLfo = ctx.createOscillator();
    tensionLfo.type = 'sine';
    tensionLfo.frequency.value = 0.07;
    const tensionLfoGain = ctx.createGain();
    tensionLfoGain.gain.value = 100;
    tensionLfo.connect(tensionLfoGain);
    tensionLfoGain.connect(tension.frequency);
    const tensionGain = ctx.createGain();
    tensionGain.gain.value = 0.008;
    tension.connect(tensionGain);

    // Master gain for ambient (for crossfade)
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 1;
    droneGain.connect(this.ambientGain);
    tensionGain.connect(this.ambientGain);
    this.ambientGain.connect(this.master);

    drone.start();
    droneLfo.start();
    tension.start();
    tensionLfo.start();
    nodes.push(drone, droneLfo, tension, tensionLfo);
    this.ambientNodes = nodes;
  }

  stopAmbient(): void {
    this.ambientPlaying = false;
    for (const node of this.ambientNodes) {
      try {
        if (node instanceof OscillatorNode) node.stop();
        else if (node instanceof AudioBufferSourceNode) node.stop();
      } catch { /* already stopped */ }
    }
    this.ambientNodes = [];
    this.ambientGain = null;
  }

  // ─── Chase BGM (intense pursuit music) ───

  private chaseNodes: AudioNode[] = [];
  private chaseGain: GainNode | null = null;
  private chasePlaying = false;
  private chasePulseTimeout: number | null = null;

  /** Start intense chase music — driving rhythm, dissonant stabs, rising tension */
  startChase(): void {
    if (!this.ready || this.chasePlaying) return;
    this.chasePlaying = true;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const nodes: AudioNode[] = [];

    this.chaseGain = ctx.createGain();
    this.chaseGain.gain.setValueAtTime(0, now);
    this.chaseGain.gain.linearRampToValueAtTime(1, now + 0.8);
    this.chaseGain.connect(this.master);

    // Fade down ambient
    if (this.ambientGain) {
      this.ambientGain.gain.linearRampToValueAtTime(0.2, now + 0.8);
    }

    // Layer 1: Driving bass pulse (eighth notes, D2)
    const bassOsc = ctx.createOscillator();
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.value = 73.4; // D2
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.frequency.value = 300;
    bassFilter.Q.value = 5;
    // Rhythmic tremolo via LFO
    const tremoloLfo = ctx.createOscillator();
    tremoloLfo.type = 'square';
    tremoloLfo.frequency.value = 3.5; // ~210 BPM eighth notes
    const tremoloGain = ctx.createGain();
    tremoloGain.gain.value = 0.04;
    const bassGain = ctx.createGain();
    bassGain.gain.value = 0.04;
    tremoloLfo.connect(tremoloGain);
    tremoloGain.connect(bassGain.gain);
    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(this.chaseGain!);
    bassOsc.start(now);
    tremoloLfo.start(now);
    nodes.push(bassOsc, tremoloLfo);

    // Layer 2: Dissonant stab cluster (Dm + tritone tension)
    const stabFreqs = [293.7, 349.2, 415.3]; // D4, F4, Ab4 (diminished feel)
    stabFreqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = freq * 1.005; // detuned
      const stabFilter = ctx.createBiquadFilter();
      stabFilter.type = 'lowpass';
      stabFilter.frequency.value = 800 + i * 200;
      // Breathing swell
      const swellLfo = ctx.createOscillator();
      swellLfo.type = 'sine';
      swellLfo.frequency.value = 0.25 + i * 0.08;
      const swellGain = ctx.createGain();
      swellGain.gain.value = 0.015;
      const stabGain = ctx.createGain();
      stabGain.gain.value = 0.015;
      swellLfo.connect(swellGain);
      swellGain.connect(stabGain.gain);
      osc.connect(stabFilter);
      osc2.connect(stabFilter);
      stabFilter.connect(stabGain);
      stabGain.connect(this.chaseGain!);
      osc.start(now);
      osc2.start(now);
      swellLfo.start(now);
      nodes.push(osc, osc2, swellLfo);
    });

    // Layer 3: High-pitched string-like tension (rising)
    const stringOsc = ctx.createOscillator();
    stringOsc.type = 'sawtooth';
    stringOsc.frequency.setValueAtTime(880, now);
    stringOsc.frequency.linearRampToValueAtTime(1100, now + 20);
    const stringFilter = ctx.createBiquadFilter();
    stringFilter.type = 'bandpass';
    stringFilter.frequency.value = 2000;
    stringFilter.Q.value = 2;
    const stringVib = ctx.createOscillator();
    stringVib.type = 'sine';
    stringVib.frequency.value = 5;
    const stringVibGain = ctx.createGain();
    stringVibGain.gain.value = 8;
    stringVib.connect(stringVibGain);
    stringVibGain.connect(stringOsc.frequency);
    const stringGain = ctx.createGain();
    stringGain.gain.value = 0.012;
    stringOsc.connect(stringFilter);
    stringFilter.connect(stringGain);
    stringGain.connect(this.chaseGain!);
    stringOsc.start(now);
    stringVib.start(now);
    nodes.push(stringOsc, stringVib);

    // Layer 4: Percussive noise hits on rhythm
    this.startChasePercLoop();

    this.chaseNodes = nodes;
  }

  private startChasePercLoop(): void {
    if (!this.chasePlaying || !this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // Kick-like thump
    const kick = ctx.createOscillator();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(120, now);
    kick.frequency.exponentialRampToValueAtTime(30, now + 0.1);
    const kickGain = ctx.createGain();
    kickGain.gain.setValueAtTime(0.12, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    kick.connect(kickGain);
    kickGain.connect(this.chaseGain ?? this.master);
    kick.start(now);
    kick.stop(now + 0.2);

    // Hi-hat noise
    const hatLen = ctx.sampleRate * 0.04;
    const hatBuf = ctx.createBuffer(1, hatLen, ctx.sampleRate);
    const hd = hatBuf.getChannelData(0);
    for (let i = 0; i < hatLen; i++) {
      hd[i] = (Math.random() * 2 - 1) * (1 - i / hatLen);
    }
    const hat = ctx.createBufferSource();
    hat.buffer = hatBuf;
    const hatFilter = ctx.createBiquadFilter();
    hatFilter.type = 'highpass';
    hatFilter.frequency.value = 8000;
    const hatGain = ctx.createGain();
    hatGain.gain.setValueAtTime(0.04, now + 0.085);
    hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    hat.connect(hatFilter);
    hatFilter.connect(hatGain);
    hatGain.connect(this.chaseGain ?? this.master);
    hat.start(now + 0.085);
    hat.stop(now + 0.15);

    // Beat interval: ~170ms = ~175 BPM quarter notes
    this.chasePulseTimeout = window.setTimeout(() => {
      this.startChasePercLoop();
    }, 170);
  }

  stopChase(): void {
    if (!this.chasePlaying) return;
    this.chasePlaying = false;
    const ctx = this.ctx;

    // Fade out chase
    if (this.chaseGain && ctx) {
      this.chaseGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
    }

    // Fade ambient back up
    if (this.ambientGain && ctx) {
      this.ambientGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    }

    // Clean up nodes after fade
    const nodesToClean = [...this.chaseNodes];
    setTimeout(() => {
      for (const node of nodesToClean) {
        try {
          if (node instanceof OscillatorNode) node.stop();
          else if (node instanceof AudioBufferSourceNode) node.stop();
        } catch { /* already stopped */ }
      }
    }, 2000);
    this.chaseNodes = [];

    if (this.chasePulseTimeout !== null) {
      clearTimeout(this.chasePulseTimeout);
      this.chasePulseTimeout = null;
    }
  }

  get isChasing(): boolean {
    return this.chasePlaying;
  }
}

/** Singleton instance */
export const audioManager = new AudioManager();
