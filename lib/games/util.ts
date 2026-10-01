// Shared helpers for every arcade game. Everything a game draws is a pure function of
// (seed, number of entries, seconds since playback started), so every visitor sees the same round.
import { mulberry32, winnerIndex } from '../game';

export { mulberry32, winnerIndex };
export const W = 1000;
export const H = 480;
export type Ctx = CanvasRenderingContext2D;

export type Result = { index: number; text: string; score: number; by?: number };
export type Built<D = unknown> = {
  winner: number;
  winnerEnd: number;            // seconds into playback when the win is revealed
  total: number;                // seconds until playback is over
  winPoint: [number, number];   // where the confetti pops
  results: Result[];            // one per entry (any order)
  data: D;
};
export type Game<D = any> = {
  key: string;
  build(seed: number, n: number): Built<D>;
  /** b is null while waiting for the next round; then t is wall-clock seconds for idle animation. */
  draw(ctx: Ctx, t: number, b: Built<D> | null, names: string[], waiting: number): void;
};

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const clamp01 = (x: number) => clamp(x, 0, 1);
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
export const easeIn = (p: number) => p * p * p;
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const TAU = Math.PI * 2;

export function rng(seed: number, salt: number) {
  const f = mulberry32((seed ^ salt) >>> 0);
  const r = (a: number, b: number) => a + f() * (b - a);
  const int = (a: number, b: number) => Math.floor(r(a, b + 1));
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(f() * arr.length)];
  return { f, r, int, pick };
}

/** Indices to animate, in play order: a shuffled sample of up to `max`, winner always included and second to last. */
export function playOrder(f: () => number, n: number, winner: number, max: number): number[] {
  const others = Array.from({ length: n }, (_, i) => i).filter((i) => i !== winner);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(f() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const keep = others.slice(0, Math.max(0, max - 1));
  keep.splice(Math.max(keep.length - 1, 0), 0, winner);
  return keep;
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const PALETTE = ['#E0412B', '#2F80ED', '#27AE60', '#FF8A3D', '#9B51E0', '#00B8D9', '#EB5757', '#6FCF97', '#A3E635', '#BB6BD9', '#56CCF2', '#FF7AB6'];
export const colorFor = (i: number) => PALETTE[i % PALETTE.length];
export const GOLD = '#F2C230';

/** A name tag, kept inside the canvas. */
export function tag(ctx: Ctx, text: string, x: number, y: number, gold = false) {
  ctx.font = '700 12px ui-monospace, monospace';
  const t = text.length > 18 ? text.slice(0, 17) + '…' : text;
  const w = ctx.measureText(t).width + 10;
  const lx = clamp(x - w / 2, 4, W - w - 4), ly = clamp(y, 4, H - 21);
  ctx.fillStyle = gold ? 'rgba(242,194,48,.96)' : 'rgba(14,36,25,.84)';
  ctx.beginPath(); ctx.roundRect(lx, ly, w, 17, 4); ctx.fill();
  ctx.fillStyle = gold ? '#10251A' : '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(t, lx + 5, ly + 12.5);
}

/** Deterministic particle burst drawn `age` seconds after it starts. */
export function burst(ctx: Ctx, x: number, y: number, age: number, salt: number, colors: string[], count = 24, speed = 160, life = 0.9, gravity = 200) {
  if (age < 0 || age > life) return;
  const f = mulberry32(salt >>> 0);
  ctx.globalAlpha = 1 - age / life;
  for (let i = 0; i < count; i++) {
    const a = f() * TAU, s = speed * (0.35 + f() * 0.65);
    const px = x + Math.cos(a) * s * age, py = y + Math.sin(a) * s * age + 0.5 * gravity * age * age;
    ctx.fillStyle = colors[i % colors.length];
    const sz = 2 + f() * 3;
    ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;
}

/** Big faint game title for idle screens. */
export function idleTitle(ctx: Ctx, text: string, sub: string, color = 'rgba(255,255,255,.9)') {
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = '400 30px var(--f-display), Impact, sans-serif';
  ctx.fillText(text, W / 2, 34);
  ctx.font = '600 12px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillText(sub, W / 2, 52);
}

/** Seeded Fisher-Yates shuffle (never use sort with a random comparator: browsers sort differently). */
export function shuffle<T>(f: () => number, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
