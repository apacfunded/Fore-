// Sound effects for a round, synthesized with the Web Audio API (no audio files).
// Driven by the same shot data as the picture, so sounds land exactly on the action.
// Browsers only allow audio after a tap or click, so sound starts off and the page
// turns it on from a button.

import { MAPS, CourseView, shotEvents } from './game';

type Ev = { t: number; kind: 'swing' | 'pad' | 'land' | 'water' | 'lava' | 'quicksand' | 'void' | 'bonk' | 'knockout' | 'cup' };

export function createSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = false;
  let roundKey = '';
  let events: Ev[] = [];
  let lastEl = -1;
  let noiseBuf: AudioBuffer | null = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  const env = (g: GainNode, t: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };
  function tone(freq: number, type: OscillatorType, peak: number, decay: number, at = 0, slideTo?: number) {
    if (!ctx || !master) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + decay);
    env(g, t, peak, 0.005, decay);
    o.connect(g).connect(master); o.start(t); o.stop(t + decay + 0.05);
  }
  function noise(filter: BiquadFilterType, freq: number, q: number, peak: number, attack: number, decay: number, at = 0, sweepTo?: number) {
    if (!ctx || !master || !noiseBuf) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    const g = ctx.createGain(); env(g, t, peak, attack, decay);
    src.connect(f).connect(g).connect(master); src.start(t, Math.random() * 0.5); src.stop(t + attack + decay + 0.05);
  }

  function play(kind: Ev['kind'], count: number) {
    const v = Math.min(1, 0.6 + count * 0.15);
    switch (kind) {
      case 'swing': tone(1400, 'triangle', 0.35 * v, 0.06); noise('bandpass', 2500, 1.2, 0.25 * v, 0.002, 0.05); break;
      case 'pad': noise('bandpass', 400, 2, 0.35 * v, 0.02, 0.45, 0, 3200); tone(220, 'sawtooth', 0.08 * v, 0.4, 0, 880); break;
      case 'land': noise('lowpass', 500, 0.7, 0.18 * v, 0.003, 0.08); break;
      case 'water': noise('lowpass', 1800, 0.8, 0.45 * v, 0.004, 0.5, 0, 300); tone(600, 'sine', 0.08, 0.2, 0.05, 200); break;
      case 'lava': noise('highpass', 3000, 0.5, 0.25 * v, 0.02, 0.9); tone(90, 'sawtooth', 0.12, 0.5); break;
      case 'quicksand': noise('lowpass', 300, 1, 0.4 * v, 0.05, 0.7, 0, 120); break;
      case 'void': tone(900, 'sine', 0.12 * v, 1.0, 0, 120); break;
      case 'bonk': tone(180, 'square', 0.14 * v, 0.12, 0, 110); break;
      case 'knockout': tone(160, 'square', 0.22 * v, 0.25, 0, 70); noise('lowpass', 800, 1, 0.25 * v, 0.003, 0.2); break;
      case 'cup': {
        tone(1800, 'triangle', 0.25, 0.05); tone(1500, 'triangle', 0.2, 0.05, 0.08); tone(1200, 'triangle', 0.18, 0.08, 0.16);
        // cheer: a swell of filtered noise
        noise('bandpass', 1100, 0.6, 0.45, 0.35, 2.4, 0.2, 1600);
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 'triangle', 0.22, 0.5, 0.25 + i * 0.11));
        break;
      }
    }
  }

  return {
    get enabled() { return enabled; },
    /** Call from a click or tap. */
    setEnabled(on: boolean) {
      enabled = on;
      if (on) { ensure(); void ctx?.resume(); play('swing', 0); }
    },
    /** Call every frame with what's on screen. */
    tick(view: CourseView) {
      const pb = view.playback;
      if (!pb) { roundKey = ''; return; }
      const el = (Date.now() - pb.startedAt) / 1000;
      const key = `${pb.roundId}:${pb.startedAt}`;
      if (key !== roundKey) {
        roundKey = key; lastEl = el - 0.05;
        const m = MAPS[pb.map];
        events = [];
        for (const s of pb.shots) {
          for (const e of shotEvents(m, s)) {
            const t = s.launch + e.t;
            if (e.type === 'launch') events.push({ t, kind: 'swing' });
            else if (e.type === 'pad') events.push({ t, kind: 'pad' });
            else if (e.type === 'land') events.push({ t, kind: 'land' });
            else if (e.type === 'hazard' && e.hazard) events.push({ t, kind: e.hazard });
            else if (e.type === 'obstacle') events.push({ t, kind: e.fail ? 'knockout' : 'bonk' });
          }
          if (s.end === 'drop') events.push({ t: s.launch + s.dur - 0.3, kind: 'cup' });
        }
        events.sort((a, b) => a.t - b.t);
      }
      if (enabled && ctx && el > lastEl && el - lastEl < 1) {
        // Group sounds that land in the same frame so a big field doesn't turn into noise.
        const due = events.filter((e) => e.t > lastEl && e.t <= el);
        const counts = new Map<Ev['kind'], number>();
        for (const e of due) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
        counts.forEach((n, kind) => play(kind, n));
      }
      lastEl = el;
    },
  };
}
