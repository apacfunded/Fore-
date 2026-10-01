import { Game, GOLD, TAU, colorFor, playOrder, rng, winnerIndex } from './util';
import { Cam, Scene, V, add, cross, drift, lerp3, mul, norm, sky } from './r3d';

const CX = 500, CY = 244, R = 172; // R = outer edge of the double ring
const BULL = 7, OUTER_BULL = 16, TRI = [97, 107], DBL = [160, 172];
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const FLY = 0.55;

type Dart = { index: number; launch: number; x: number; y: number; sx: number; kind: 'board' | 'miss' | 'bounce' | 'bull' };
type D = { darts: Dart[] };

function scoreAt(x: number, y: number): string {
  const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy);
  if (d <= BULL) return 'Bullseye';
  if (d <= OUTER_BULL) return 'Outer bull · 25';
  if (d > DBL[1]) return 'Missed the board';
  let ang = Math.atan2(dx, -dy); if (ang < 0) ang += TAU;
  const n = SECTORS[Math.floor(((ang + Math.PI / 20) % TAU) / (TAU / 20))];
  if (d >= DBL[0]) return `Double ${n}`;
  if (d >= TRI[0] && d <= TRI[1]) return `Triple ${n}`;
  return `Single ${n}`;
}

// 3D: the board hangs on a wall facing +Z. 2D board coords map to X = x - CX, Y = 300 - (y - CY), Z = 0.
const WB = (x: number, y: number, z = 0): V => [x - CX, 300 - (y - CY), z];
const SEG = TAU / 20;

function board3(sc: Scene) {
  sc.custom(0, 0, () => sky(sc.ctx, '#0F171F', '#22303C'));
  sc.poly([[-1400, 0, -40], [1400, 0, -40], [1400, 0, 900], [-1400, 0, 900]], '#3A2A20', { layer: 1, light: false });
  for (let i = -10; i <= 10; i++) sc.line([i * 120, 0.2, -40], [i * 120, 0.2, 900], '#46342A', 1, { layer: 1 });
  sc.poly([[-1400, 0, -40], [1400, 0, -40], [1400, 900, -40], [-1400, 900, -40]], '#1F2D38', { layer: 1, light: false });
  for (let i = -12; i <= 12; i++) sc.line([i * 110, 0, -39], [i * 110, 900, -39], '#263744', 1.2, { layer: 1 });
  sc.box([0, 300, -30], 520, 520, 18, '#5A3A22', { layer: 1, top: '#6B482B' });
  sc.disc(WB(CX, CY, -18), R + 34, [0, 0, 1], '#111111', { layer: 1, segs: 48, light: false });
  for (let i = 0; i < 20; i++) {
    const a0 = -Math.PI / 2 - SEG / 2 + i * SEG;
    const dark = i % 2 === 0;
    const ring = (r0: number, r1: number, c: string) => {
      const pts: V[] = [];
      for (let k = 0; k <= 4; k++) { const a = a0 + (SEG * k) / 4; pts.push(WB(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1, -17)); }
      for (let k = 4; k >= 0; k--) { const a = a0 + (SEG * k) / 4; pts.push(WB(CX + Math.cos(a) * r0, CY + Math.sin(a) * r0, -17)); }
      sc.poly(pts, c, { layer: 1, light: false });
    };
    ring(OUTER_BULL, TRI[0], dark ? '#1C1C1C' : '#F1E6C8');
    ring(TRI[0], TRI[1], dark ? '#C8312A' : '#2E8B57');
    ring(TRI[1], DBL[0], dark ? '#1C1C1C' : '#F1E6C8');
    ring(DBL[0], DBL[1], dark ? '#C8312A' : '#2E8B57');
    const mid = a0 + SEG / 2;
    sc.text(WB(CX + Math.cos(mid) * (R + 17), CY + Math.sin(mid) * (R + 17), -16), String(SECTORS[i]), '#FFFFFF', 15, 1);
  }
  sc.disc(WB(CX, CY, -16.5), OUTER_BULL, [0, 0, 1], '#2E8B57', { layer: 1, light: false, segs: 20 });
  sc.disc(WB(CX, CY, -16), BULL, [0, 0, 1], '#C8312A', { layer: 1, light: false, segs: 16 });
  // spotlight glow
  sc.custom(1, 0, () => { const p = sc.cam.p(WB(CX, CY, -16)); if (!p) return; const g = sc.ctx, r = 320 * p.s; const gr = g.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r); gr.addColorStop(0, 'rgba(255,240,200,.10)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill(); });
}

function dart3(sc: Scene, tip: V, col: string, a = 1, dir: V = [0.12, -0.18, 1]) {
  const d = norm(dir);
  const at = (k: number): V => add(tip, mul(d, k));
  sc.tube(tip, at(9), 1.2, '#D7DCE3', { alpha: a, segs: 5, r2: 2 });
  sc.tube(at(9), at(30), 3, '#3A3F48', { alpha: a, segs: 7 });
  sc.tube(at(30), at(46), 1.4, '#B9BEC6', { alpha: a, segs: 5 });
  const side = norm(cross(d, [0, 1, 0])), up = cross(side, d);
  for (const s of [side, up, mul(side, -1), mul(up, -1)]) sc.poly([at(40), add(at(48), mul(s, 9)), add(at(58), mul(s, 9)), at(56)], col, { alpha: a, amb: 0.65 });
}

export const darts: Game<D> = {
  key: 'darts',
  build(seed, n) {
    const { f, r } = rng(seed, 0xda27);
    const winner = winnerIndex(seed, n);
    const all: Dart[] = Array.from({ length: n }, (_, index) => {
      const sx = r(-260, 260);
      const at = (d: number) => { const a = r(0, TAU); return { x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d }; };
      if (index === winner) { const p = at(r(0, 4)); return { index, launch: 0, ...p, sx, kind: 'bull' }; }
      const k = f();
      if (k < 0.12) return { index, launch: 0, ...at(r(178, 205)), sx, kind: 'miss' };
      if (k < 0.2) return { index, launch: 0, ...at(r(30, 165)), sx, kind: 'bounce' };
      if (k < 0.32) return { index, launch: 0, ...at(r(BULL + 2, OUTER_BULL + 6)), sx, kind: 'board' };
      return { index, launch: 0, ...at(r(OUTER_BULL + 4, DBL[1] - 1)), sx, kind: 'board' };
    });
    const order = playOrder(f, n, winner, 60);
    const gap = Math.min(0.6, 10 / order.length);
    const ds = order.map((i, k) => ({ ...all[i], launch: k * gap }));
    const w = ds.find((d) => d.index === winner)!;
    const winnerEnd = w.launch + FLY + 0.1;
    const total = Math.max(...ds.map((d) => d.launch + FLY + 0.8), winnerEnd) + 4;
    return {
      winner, winnerEnd, total, winPoint: [CX, CY], data: { darts: ds },
      results: all.map((d) => ({
        index: d.index,
        score: d.kind === 'bull' ? 1e6 : d.kind === 'bounce' ? -900 : -Math.hypot(d.x - CX, d.y - CY),
        text: d.kind === 'bounce' ? 'Bounced off the wire' : scoreAt(d.x, d.y),
      })),
    };
  },
  draw(ctx, t, b, names, waiting) {
    const cam = new Cam([120 + drift(t, 80), 380, 560], [0, 290, -20], 44);
    const sc = new Scene(ctx, cam);
    board3(sc);
    if (!b) { for (let i = 0; i < Math.min(waiting, 8); i++) dart3(sc, [300 + (i % 4) * 26, 40, 120 + Math.floor(i / 4) * 30], colorFor(i), 1, [0, 1, 0.1]); sc.flush(); return; }
    let last: { d: Dart; p: V } | null = null;
    for (const d of b.data.darts) {
      const e = t - d.launch;
      if (e < 0) continue;
      const col = d.index === b.winner && t >= b.winnerEnd ? GOLD : colorFor(d.index);
      const hit = WB(d.x, d.y, -16);
      if (e < FLY) {
        const p = e / FLY;
        const from: V = [d.sx * 0.6, 260, 620];
        const pos = add(lerp3(from, hit, p), [0, Math.sin(Math.PI * p) * 60, 0]);
        dart3(sc, pos, col, 1, [0.12, -0.18 + (1 - p) * 0.3, 1]);
        last = { d, p: pos };
      } else if (d.kind === 'bounce') {
        const q = e - FLY;
        if (q < 1) dart3(sc, [hit[0] + q * 30, Math.max(4, hit[1] - 400 * q * q), hit[2] + q * 120], col, q > 0.7 ? 1 - (q - 0.7) / 0.3 : 1, [Math.sin(q * 6), Math.cos(q * 6), 0.5]);
      } else dart3(sc, hit, col);
    }
    if (last) sc.label(last.p, names[last.d.index] ?? '', false, -40);
    sc.burst(WB(CX, CY, 0), t - b.winnerEnd, 5, [GOLD, '#FFFFFF', '#C8312A'], 50, 150, 1.2, 100);
    sc.flush();
  },
};
