import { Game, GOLD, TAU, clamp01, colorFor, lerp, mulberry32, playOrder, rng, winnerIndex } from './util';
import { Cam, Scene, V, add, drift, mul, norm, sky } from './r3d';

const BACK = 175, EDGE = 382, DROP = 0.65, SLIDE = 70, BAND = 150;
const shelfX = (y: number) => { const p = (y - BACK) / (EDGE - BACK); return [lerp(270, 190, p), lerp(730, 810, p)] as const; };
const scl = (y: number) => 0.72 + 0.28 * (y - BACK) / (EDGE - BACK);

type Kind = 'tip' | 'pile' | 'edge' | 'gutter';
type Coin = { index: number; launch: number; kind: Kind; x: number; y: number };
type D = { coins: Coin[]; pile: { x: number; y: number }[]; tipAt: number; tipX: number };

// 3D: a coin pusher cabinet. The shelf runs from Z = -SH (back) to Z = 0 (the ledge); 2D shelf coords map onto it.
const SH = 240, SW = 300;
const WS = (x: number, y: number): V => {
  const yy = Math.min(y, EDGE); const [l, r] = shelfX(yy);
  const u = (x - (l + r) / 2) / ((r - l) / 2);
  return [u * SW, 0, -SH + ((yy - BACK) / (EDGE - BACK)) * SH];
};

function cabinet(sc: Scene, t: number, glow: number) {
  sc.custom(0, 0, () => sky(sc.ctx, '#1A0A24', '#3A1A4A'));
  sc.poly([[-1200, -160, -900], [1200, -160, -900], [1200, -160, 700], [-1200, -160, 700]], '#140A1C', { layer: 1, light: false });
  // cabinet body
  sc.box([0, -80, -SH / 2], SW * 2 + 120, 160, SH + 140, '#4A1F5C', { layer: 1, top: '#5A2A6E' });
  sc.poly([[-SW, 0.5, -SH], [SW, 0.5, -SH], [SW, 0.5, 0], [-SW, 0.5, 0]], '#6D5A86', { layer: 1, light: false });
  sc.box([0, -40, 30], SW * 2, 6, 60, '#4A3C5E', { layer: 1, top: '#5A4A70' });
  // side gutters
  for (const sx of [-1, 1]) sc.poly([[sx * SW, 0.5, -SH], [sx * (SW + 50), 0.5, -SH], [sx * (SW + 50), 0.5, 0], [sx * SW, 0.5, 0]], '#0B0611', { layer: 1, light: false });
  // back wall and glass sides
  sc.box([0, 160, -SH - 70], SW * 2 + 120, 320, 20, '#2A1236', { layer: 1 });
  for (const sx of [-1, 1]) sc.box([sx * (SW + 60), 120, -SH / 2], 10, 240, SH + 140, '#9F7FC0', { alpha: 0.18, light: false });
  // pusher block slides back and forth
  const push = 22 * (0.5 - 0.5 * Math.cos(TAU * t / 2.4));
  sc.box([0, 22, -SH - 40 + push], SW * 2 - 20, 44, 80, '#B9A6D8', { top: '#CFC0EA' });
  // marquee
  sc.box([0, 300, -SH - 50], SW * 2 + 80, 50, 20, '#2A1236');
  sc.text([0, 300, -SH - 38], 'JACKPOT LEDGE', glow ? GOLD : '#C9A030', 30, 2);
  for (let i = 0; i < 18; i++) sc.sphere([-SW - 20 + i * ((SW * 2 + 40) / 17), 335, -SH - 40], 6, (Math.floor(t * (glow ? 14 : 4)) + i) % 2 ? GOLD : '#5A4010', { shine: 0.8 });
  // coin slot
  sc.box([0, 250, -SH - 55], 70, 10, 12, '#000000');
}

/** Where a coin is at time t once the ledge tips (null if it doesn't move). y past EDGE means it has gone over. */
function tipped(x: number, y: number, d: D, t: number, salt: number) {
  if (t < d.tipAt || Math.abs(x - d.tipX) > BAND || y < EDGE - 75) return null;
  const e = t - d.tipAt, reach = (EDGE - y) / SLIDE;
  if (e < reach) return { x, y: y + SLIDE * e, a: 1 };
  const q = e - reach, f = mulberry32(salt);
  const yy = EDGE + 30 * q + 420 * q * q;
  return { x: x + (f() - 0.5) * 80 * q, y: yy, a: clamp01(1 - (yy - 430) / 50) };
}

function coin3(sc: Scene, p: V, col: string, a = 1, tilt = 0) {
  const up: V = tilt ? norm([0, Math.cos(tilt), Math.sin(tilt)]) : [0, 1, 0];
  sc.tube(p, add(p, mul(up, 4)), 15, '#8A6A18', { segs: 14, alpha: a, cap: false });
  sc.disc(add(p, mul(up, 4.2)), 15, up, col, { alpha: a, segs: 16, amb: 0.7 });
  sc.disc(add(p, mul(up, 4.4)), 10, up, '#FFFFFF', { alpha: 0.18 * a, segs: 12, light: false });
}

export const pusher: Game<D> = {
  key: 'pusher',
  build(seed, n) {
    const { f, r } = rng(seed, 0xc011);
    const winner = winnerIndex(seed, n);
    const tipX = r(380, 620);
    const pile = Array.from({ length: 80 }, () => { const y = r(BACK + 30, EDGE - 6); const [a, b] = shelfX(y); return { x: r(a + 16, b - 16), y }; });
    const all: Coin[] = Array.from({ length: n }, (_, index) => {
      if (index === winner) return { index, launch: 0, kind: 'tip', x: tipX + r(-30, 30), y: EDGE - r(26, 40) };
      const p = f();
      if (p < 0.15) { const left = f() < 0.5; return { index, launch: 0, kind: 'gutter', x: left ? r(170, 200) : r(800, 830), y: r(220, 330) }; }
      if (p < 0.33) { const x = f() < 0.5 ? r(220, Math.max(222, tipX - BAND - 20)) : r(Math.min(778, tipX + BAND + 20), 780); return { index, launch: 0, kind: 'edge', x, y: EDGE - r(6, 16) }; }
      const y = r(BACK + 25, EDGE - 90); const [a, b] = shelfX(y);
      return { index, launch: 0, kind: 'pile', x: r(a + 18, b - 18), y };
    });
    const order = playOrder(f, n, winner, 60);
    const gap = Math.min(0.45, 8 / order.length);
    const coins = order.map((i, k) => ({ ...all[i], launch: k * gap }));
    const w = coins.find((c) => c.index === winner)!;
    const tipAt = w.launch + DROP + 0.6;
    const winnerEnd = tipAt + 0.9;
    const total = Math.max(winnerEnd, ...coins.map((c) => c.launch + DROP)) + 4;
    const label: Record<Kind, string> = { tip: 'Tipped the ledge', pile: 'Landed on the pile', edge: 'Hanging on the edge', gutter: 'Fell in the side gutter' };
    const score: Record<Kind, number> = { tip: 99, edge: 3, pile: 2, gutter: 0 };
    return {
      winner, winnerEnd, total, winPoint: [w.x, EDGE + 10], data: { coins, pile, tipAt, tipX },
      results: all.map((c) => ({ index: c.index, text: label[c.kind], score: score[c.kind] + (c.kind === 'edge' ? (c.y - EDGE + 20) / 100 : 0) })),
    };
  },
  draw(ctx, t, b, names, waiting) {
    const glow = b && t >= b.winnerEnd - 0.9 ? 1 : 0;
    const cam = new Cam([drift(t, 90), 380, 470], [0, -10, -110], 46);
    const sc = new Scene(ctx, cam);
    cabinet(sc, t, glow);
    const fallback: D = { coins: [], pile: [], tipAt: Infinity, tipX: 500 };
    const d = b ? b.data : fallback;
    const pile = b ? d.pile : Array.from({ length: 80 }, (_, i) => { const f = mulberry32(i + 1); const y = BACK + 30 + f() * (EDGE - BACK - 36); const [a, c] = shelfX(y); return { x: a + 16 + f() * (c - a - 32), y }; });
    const place = (x: number, y: number, stack: number): V => { const w = WS(x, y); return [w[0], stack * 4.4, w[2]]; };
    pile.forEach((c, i) => {
      const st = mulberry32(i * 7 + 3)() < 0.25 ? 1 : 0;
      const m = tipped(c.x, c.y, d, t, i + 900);
      if (!m) return coin3(sc, place(c.x, c.y, st), '#E8B830');
      const base = place(c.x, Math.min(m.y, EDGE), st);
      const fall = Math.max(0, m.y - EDGE);
      coin3(sc, [base[0], base[1] - fall * 1.4, base[2] + Math.min(40, fall * 0.4)], GOLD, m.a, Math.min(1.2, fall / 40));
    });
    if (!b) { for (let i = 0; i < Math.min(waiting, 6); i++) coin3(sc, [-60 + i * 24, 262, -SH - 40], colorFor(i)); sc.flush(); return; }
    let lastDrop: { c: Coin; p: V } | null = null;
    for (const c of d.coins) {
      const e = t - c.launch;
      if (e < 0) continue;
      const col = c.index === b.winner && t >= d.tipAt ? GOLD : colorFor(c.index);
      const land = place(c.x, c.y, 1);
      if (e < DROP) { const p = e / DROP; const pos: V = [land[0] * p, 250 - (250 - land[1]) * p * p, -SH - 40 + (land[2] + SH + 40) * p]; coin3(sc, pos, col, 1, (1 - p) * 1.2); lastDrop = { c, p: pos }; continue; }
      if (c.kind === 'gutter') { const q = e - DROP; if (q < 0.8) coin3(sc, [land[0] + Math.sign(land[0]) * 30, land[1] - 300 * q * q, land[2]], col, 1 - q / 0.8, q * 3); continue; }
      const m = c.kind === 'tip' ? tipped(c.x, c.y, d, t, 77) : null;
      if (!m) { coin3(sc, land, col); continue; }
      const base = place(c.x, Math.min(m.y, EDGE), 1), fall = Math.max(0, m.y - EDGE);
      coin3(sc, [base[0], base[1] - fall * 1.4, base[2] + Math.min(40, fall * 0.4)], col, m.a, Math.min(1.2, fall / 40));
    }
    if (lastDrop) sc.label(lastDrop.p, names[lastDrop.c.index] ?? '', false, -28);
    sc.burst(WS(b.winPoint[0], EDGE), t - b.winnerEnd, 61, [GOLD, '#FFFFFF', '#E8B830'], 60, 160, 1.3, 140);
    sc.flush();
  },
};
