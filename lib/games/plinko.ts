import { Game, GOLD, clamp01, colorFor, lerp, playOrder, rng, winnerIndex } from './util';
import { Cam, Scene, V, sky, drift } from './r3d';

const ROWS = 12, SP = 36, TOP = 58, RH = 26, CX = 500, STEP = 0.17, FALL = 0.45;
const px = (rights: number, k: number) => CX + (rights - k / 2) * SP;
const py = (k: number) => TOP + k * RH;
const BIN_Y = py(ROWS) + 6;
const BIN_BOTTOM = 462;

type Chip = { index: number; path: number[]; slot: number; launch: number; restY: number };
type D = { chips: Chip[] };

function chipPos(c: Chip, t: number): { x: number; y: number; done: boolean } | null {
  const e = t - c.launch;
  if (e < 0) return null;
  const k = Math.floor(e / STEP);
  if (k >= ROWS) {
    const p = clamp01((e - ROWS * STEP) / FALL);
    return { x: px(c.slot, ROWS), y: lerp(py(ROWS), c.restY, p * p), done: p >= 1 };
  }
  const fr = e / STEP - k;
  const x0 = px(c.path[k], k), x1 = px(c.path[k + 1], k + 1);
  return { x: lerp(x0, x1, fr), y: lerp(py(k), py(k + 1), fr) - Math.sin(Math.PI * fr) * 10, done: false };
}

// 3D: the board stands upright at z = 0; screen-space layout maps to X = x - 500, Y = 480 - y.
const WX = (x: number) => x - CX, WY = (y: number) => 480 - y;
const PEGS: V[] = [];
for (let k = 1; k < ROWS; k++) for (let j = 0; j <= k; j++) PEGS.push([WX(px(j, k)), WY(py(k) + 9), 6]);

function board3(sc: Scene, t: number, glow: number) {
  sc.custom(0, 0, () => sky(sc.ctx, '#120A2A', '#2B1758'));
  sc.poly([[-900, -40, 400], [900, -40, 400], [900, -40, -400], [-900, -40, -400]], '#1A1033', { layer: 1, light: false });
  sc.box([0, 225, -14], 560, 540, 20, '#2A1A5E', { layer: 1 });
  sc.poly([[-250, 10, -3], [250, 10, -3], [250, 470, -3], [-250, 470, -3]], '#3A2580', { layer: 1, light: false });
  sc.box([-272, 225, 4], 24, 540, 40, '#5B3FB0', { top: '#7A5DD0' });
  sc.box([272, 225, 4], 24, 540, 40, '#5B3FB0', { top: '#7A5DD0' });
  sc.box([0, 492, 4], 568, 24, 40, '#5B3FB0', { top: '#7A5DD0' });
  for (let i = 0; i < 18; i++) {
    const on = (Math.floor(t * (glow ? 14 : 5)) + i) % 3 === 0;
    sc.sphere([-272, 30 + i * 26, 26], 5, on ? GOLD : '#6A4A20', { shine: on ? 0.9 : 0.3 });
    sc.sphere([272, 30 + i * 26, 26], 5, on ? GOLD : '#6A4A20', { shine: on ? 0.9 : 0.3 });
  }
  for (const p of PEGS) { sc.disc([p[0] + 2, p[1] - 2, -2.5], 3.4, [0, 0, 1], '#000000', { layer: 1, light: false, alpha: 0.35, segs: 8 }); sc.tube([p[0], p[1], -3], p, 2.6, '#C9C2F0', { segs: 6 }); sc.sphere(p, 3.4, '#F2EEFF', { shine: 0.6 }); }
  const by0 = WY(BIN_BOTTOM), by1 = WY(BIN_Y);
  for (let s = 0; s <= ROWS; s++) {
    const x = WX(px(s, ROWS));
    const mid = s === ROWS / 2;
    sc.poly([[x - SP / 2, by0, -2], [x + SP / 2, by0, -2], [x + SP / 2, by1, -2], [x - SP / 2, by1, -2]], mid ? GOLD : s % 2 ? '#3F2A88' : '#4A3396', { layer: 1, light: false, alpha: mid ? 0.55 + 0.45 * glow : 1 });
    sc.box([x - SP / 2, (by0 + by1) / 2, 6], 3, by1 - by0, 16, '#A99CF0');
  }
  sc.box([WX(px(ROWS, ROWS)) + SP / 2, (by0 + by1) / 2, 6], 3, by1 - by0, 16, '#A99CF0');
  sc.box([0, by0 - 3, 6], SP * (ROWS + 1) + 4, 6, 18, '#A99CF0');
  sc.box([-21, WY(33), 6], 4, 24, 14, '#A99CF0'); sc.box([21, WY(33), 6], 4, 24, 14, '#A99CF0');
  sc.custom(9, 0, () => { const p = sc.cam.p([0, by0 - 18, 14]); if (!p) return; const g = sc.ctx; g.font = '700 12px ui-monospace, monospace'; g.textAlign = 'center'; g.fillStyle = GOLD; g.fillText('JACKPOT', p.x, p.y); });
}

function chip3(sc: Scene, x: number, y: number, col: string) {
  sc.disc([WX(x) + 3, WY(y) - 4, -2], 6.5, [0, 0, 1], '#000000', { layer: 1, light: false, alpha: 0.3, segs: 12 });
  sc.sphere([WX(x), WY(y), 8], 7, col, { shine: 0.7 });
}

export const plinko: Game<D> = {
  key: 'plinko',
  build(seed, n) {
    const { f, int } = rng(seed, 0x51ed27);
    const winner = winnerIndex(seed, n);
    const paths: { path: number[]; slot: number }[] = [];
    for (let i = 0; i < n; i++) {
      let bits: number[] = Array.from({ length: ROWS }, () => (f() < 0.5 ? 1 : 0));
      if (i === winner) {
        bits = Array.from({ length: ROWS }, (_, k) => (k < ROWS / 2 ? 1 : 0));
        for (let k = ROWS - 1; k > 0; k--) { const j = Math.floor(f() * (k + 1)); [bits[k], bits[j]] = [bits[j], bits[k]]; }
      } else if (bits.reduce((a, b) => a + b, 0) === ROWS / 2) {
        const k = int(0, ROWS - 1); bits[k] = 1 - bits[k];
      }
      const path = [0];
      for (const b of bits) path.push(path[path.length - 1] + b);
      paths.push({ path, slot: path[ROWS] });
    }
    const order = playOrder(f, n, winner, 90);
    const gap = Math.min(0.45, 9 / order.length);
    const stack = new Map<number, number>();
    const chips: Chip[] = order.map((index, k) => {
      const { path, slot } = paths[index];
      const c = stack.get(slot) ?? 0; stack.set(slot, c + 1);
      return { index, path, slot, launch: k * gap, restY: Math.max(BIN_Y + 10, BIN_BOTTOM - 8 - c * 11) };
    });
    const w = chips.find((c) => c.index === winner)!;
    const winnerEnd = w.launch + ROWS * STEP + FALL;
    const total = Math.max(...chips.map((c) => c.launch + ROWS * STEP + FALL), winnerEnd) + 4;
    return {
      winner, winnerEnd, total, winPoint: [CX, BIN_Y + 20], data: { chips },
      results: paths.map((p, index) => {
        const d = p.slot - ROWS / 2;
        return { index, score: index === winner ? 1e6 : -Math.abs(d), text: d === 0 ? 'Jackpot slot' : `${Math.abs(d)} slot${Math.abs(d) > 1 ? 's' : ''} ${d < 0 ? 'left' : 'right'}` };
      }),
    };
  },
  draw(ctx, t, b, names, waiting) {
    const won = b && t >= b.winnerEnd ? 0.5 + 0.5 * Math.sin(t * 12) : 0;
    const cam = new Cam([140 + drift(t, 90), 270, 680], [0, 245, 0], 44);
    const sc = new Scene(ctx, cam);
    board3(sc, t, won);
    if (!b) {
      for (let i = 0; i < Math.min(waiting, 8); i++) chip3(sc, CX - 14 + (i % 4) * 9, 30 - Math.floor(i / 4) * 9 + Math.sin(t * 3 + i) * 1.5, colorFor(i));
      sc.flush(); return;
    }
    const live: { c: Chip; x: number; y: number }[] = [];
    for (const c of b.data.chips) {
      const p = chipPos(c, t);
      if (!p) continue;
      chip3(sc, p.x, p.y, c.index === b.winner && p.done ? GOLD : colorFor(c.index));
      if (!p.done) live.push({ c, x: p.x, y: p.y });
    }
    for (const l of live.slice(-2)) sc.label([WX(l.x), WY(l.y), 8], names[l.c.index] ?? '', false, -30);
    sc.burst([0, WY(BIN_Y) - 20, 10], t - b.winnerEnd, 99, [GOLD, '#FFFFFF', '#B9A6FF'], 50, 130, 1.2, 120);
    sc.flush();
  },
};
