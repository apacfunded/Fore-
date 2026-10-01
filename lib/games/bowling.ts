import { Game, GOLD, clamp01, easeInOut, colorFor, lerp, rng, shuffle, winnerIndex, mulberry32 } from './util';
import { Cam, Scene, drift, lerp3, sky } from './r3d';

const LANES = 8, TOPY = 40, LH = 54, FOUL = 160, PIN_X = 820, PIT = 930, ROLL = 1.9;
const laneY = (l: number) => TOPY + l * LH + LH / 2;
// Pin numbers 1-10 as (x offset, y offset). 7 and 10 are the back corners.
const PINS: [number, number][] = [[0, 0], [11, -6], [11, 6], [22, -12], [22, 0], [22, 12], [33, -18], [33, -6], [33, 6], [33, 18]];

type Kind = 'strike' | 'nine' | 'split' | 'gutter' | 'some';
type Roll = { index: number; lane: number; launch: number; kind: Kind; down: number[]; aim: number; left?: number };
type D = { rolls: Roll[] };

function outcome(f: () => number, win: boolean): { kind: Kind; down: number[]; left?: number } {
  const all = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  if (win) return { kind: 'strike', down: all };
  const p = f();
  if (p < 0.28) { const left = f() < 0.5 ? 6 : 9; return { kind: 'nine', down: all.filter((i) => i !== left), left }; }
  if (p < 0.42) return { kind: 'split', down: all.filter((i) => i !== 6 && i !== 9) };
  if (p < 0.54) return { kind: 'gutter', down: [] };
  const k = 3 + Math.floor(f() * 6);
  // Front pins tend to fall first.
  const keyed = all.map((i) => ({ i, key: PINS[i][0] + f() * 30 }));
  keyed.sort((a, b) => a.key - b.key || a.i - b.i);
  return { kind: 'some', down: keyed.slice(0, k).map((x) => x.i) };
}

function ballPos(r: Roll, t: number) {
  const e = t - r.launch;
  if (e < 0) return { x: FOUL - 30, y: laneY(r.lane), on: false };
  const p = clamp01(e / ROLL);
  const x = lerp(FOUL - 30, PIT, Math.pow(p, 0.9));
  const hook = r.kind === 'gutter' ? r.aim * Math.min(1, p * 2.4) * 21 : Math.sin(p * Math.PI * 0.9) * -10 * r.aim + r.aim * 3 * p;
  return { x, y: laneY(r.lane) + hook, on: p < 1 };
}
const hitTime = (r: Roll) => r.launch + ROLL * Math.pow((PIN_X - FOUL + 30) / (PIT - FOUL + 30), 1 / 0.9);

// 3D: lanes run away from the camera (-Z). Lane l is centred at X = laneX(l).
const LW3 = 66, LANE_LEN = 900, PIN_Z = -800;
const laneX = (l: number) => (l - (LANES - 1) / 2) * (LW3 + 14);
const ZW = (x: number) => -(x - FOUL) * (LANE_LEN / (PIT - FOUL));
const PS = 1.5; // pin spacing scale

function alley(sc: Scene) {
  sc.custom(0, 0, () => sky(sc.ctx, '#120C1A', '#2A1F38'));
  sc.poly([[-1200, -1, 400], [1200, -1, 400], [1200, -1, -1200], [-1200, -1, -1200]], '#1E1726', { layer: 1, light: false });
  for (let l = 0; l < LANES; l++) {
    const x = laneX(l);
    sc.poly([[x - LW3 / 2 - 7, 0, 30], [x + LW3 / 2 + 7, 0, 30], [x + LW3 / 2 + 7, 0, -LANE_LEN - 40], [x - LW3 / 2 - 7, 0, -LANE_LEN - 40]], '#2E2838', { layer: 1, light: false });
    sc.poly([[x - LW3 / 2, 0.2, 30], [x + LW3 / 2, 0.2, 30], [x + LW3 / 2, 0.2, -LANE_LEN], [x - LW3 / 2, 0.2, -LANE_LEN]], '#D9A866', { layer: 1, light: false });
    for (let k = 1; k < 6; k++) sc.line([x - LW3 / 2 + k * (LW3 / 6), 0.3, 30], [x - LW3 / 2 + k * (LW3 / 6), 0.3, -LANE_LEN], '#C8955A', 0.6, { layer: 1 });
    for (let k = -2; k <= 2; k++) sc.poly([[x + k * 9 - 3, 0.4, -230 + Math.abs(k) * 14], [x + k * 9 + 3, 0.4, -230 + Math.abs(k) * 14], [x + k * 9, 0.4, -244 + Math.abs(k) * 14]], '#6B2E14', { layer: 1, light: false });
    sc.poly([[x - LW3 / 2, 0.4, 2], [x + LW3 / 2, 0.4, 2], [x + LW3 / 2, 0.4, -2], [x - LW3 / 2, 0.4, -2]], '#C0392B', { layer: 1, light: false });
    sc.box([x + LW3 / 2 + 7, 4, -LANE_LEN / 2], 3, 8, LANE_LEN + 60, '#3B3346');
  }
  sc.box([0, 60, -LANE_LEN - 70], 1300, 120, 30, '#100B16', { layer: 1 });
  sc.box([0, 95, -LANE_LEN - 40], 1300, 40, 20, '#2B2440', { layer: 1 });
}

function pin3(sc: Scene, x: number, y: number, z: number, a = 1, tilt = 0, dir = 1) {
  const up: [number, number, number] = [Math.sin(tilt) * dir, Math.cos(tilt), -Math.sin(tilt) * 0.4];
  const at = (h: number): [number, number, number] => [x + up[0] * h, y + up[1] * h, z + up[2] * h];
  if (y < 1 && tilt < 0.2) sc.shadow([x + 2, 0.5, z + 1], 5, 0.25 * a);
  sc.tube(at(0), at(12), 4.2, '#FAFAF5', { r2: 3, segs: 8, alpha: a });
  sc.tube(at(12), at(15), 2.6, '#C0392B', { segs: 8, alpha: a, cap: false });
  sc.tube(at(15), at(19), 2.2, '#FAFAF5', { segs: 8, alpha: a, cap: false });
  sc.sphere(at(21), 3.2, '#FAFAF5', { alpha: a, shine: 0.4 });
}

export const bowling: Game<D> = {
  key: 'bowling',
  build(seed, n) {
    const { f } = rng(seed, 0xb0b1);
    const winner = winnerIndex(seed, n);
    const outs = Array.from({ length: n }, (_, i) => outcome(f, i === winner));
    // Show the winner plus up to 7 others, one per lane.
    const others = shuffle(f, Array.from({ length: n }, (_, i) => i).filter((i) => i !== winner)).slice(0, LANES - 1);
    const shown = shuffle(f, [...others, winner]);
    const off = Math.floor((LANES - shown.length) / 2);
    const launchOrder = shuffle(f, others); launchOrder.push(winner);
    const rolls: Roll[] = shown.map((index, k) => {
      const o = outs[index];
      return { index, lane: k + off, launch: launchOrder.indexOf(index) * 0.45, kind: o.kind, down: o.down, left: o.left, aim: o.kind === 'gutter' ? (f() < 0.5 ? -1 : 1) : f() < 0.5 ? -1 : 1 };
    });
    const w = rolls.find((r) => r.index === winner)!;
    const winnerEnd = hitTime(w) + 0.5;
    const total = Math.max(...rolls.map((r) => r.launch + ROLL), winnerEnd) + 4;
    const text = (o: ReturnType<typeof outcome>) => o.kind === 'strike' ? 'Strike' : o.kind === 'nine' ? `9 · left the ${o.left === 6 ? 7 : 10} pin` : o.kind === 'split' ? '7-10 split' : o.kind === 'gutter' ? 'Gutter ball' : `${o.down.length} pins`;
    return {
      winner, winnerEnd, total, winPoint: [PIN_X + 16, laneY(w.lane)], data: { rolls },
      results: outs.map((o, index) => ({ index, text: text(o), score: o.kind === 'strike' ? 99 : o.down.length + (o.kind === 'split' ? 0.5 : 0) })),
    };
  },
  draw(ctx, t, b, names, waiting) {
    const k = b ? easeInOut(Math.max(0, Math.min(1, (t - 0.4) / 1.8))) : 0;
    const cam = new Cam(lerp3([drift(t, 50), 150, 260], [drift(t, 20), 230, -470], k), lerp3([0, 0, -560], [0, 0, -775], k), 50);
    const sc = new Scene(ctx, cam);
    alley(sc);
    const rack = (l: number, a = 1) => { for (const [dx, dy] of PINS) pin3(sc, laneX(l) + dy * PS, 0, PIN_Z - dx * PS, a); };
    if (!b) {
      for (let l = 0; l < LANES; l++) rack(l);
      for (let i = 0; i < Math.min(waiting, LANES); i++) sc.sphere([laneX(i), 8, 14], 8, colorFor(i), { shine: 0.7 });
      sc.flush(); return;
    }
    const used = new Set(b.data.rolls.map((r) => r.lane));
    for (let l = 0; l < LANES; l++) if (!used.has(l)) rack(l, 0.45);
    for (const r of b.data.rolls) {
      const lx = laneX(r.lane), th = hitTime(r);
      const isW = r.index === b.winner;
      const fr = mulberry32(r.index * 131 + 7);
      PINS.forEach(([dx, dy], i) => {
        const vx = (dy === 0 ? (fr() - 0.5) * 2 : Math.sign(dy)) * (30 + fr() * 70), vz = 80 + fr() * 140, vy = 60 + fr() * 90;
        const knocked = r.down.includes(i);
        const e = t - th - dx / 140;
        const x0 = lx + dy * PS, z0 = PIN_Z - dx * PS;
        if (!knocked || e < 0) return pin3(sc, x0, 0, z0);
        if (e < 1.1) pin3(sc, Math.max(lx - LW3 / 2 - 4, Math.min(lx + LW3 / 2 + 4, x0 + vx * e)), Math.max(0, vy * e - 260 * e * e), z0 - vz * e, e > 0.8 ? 1 - (e - 0.8) / 0.3 : 1, Math.min(1.5, e * 5), Math.sign(vx) || 1);
      });
      const p = ballPos(r, t);
      if (p.on) {
        const bx = lx + (p.y - laneY(r.lane)) * 1.5, bz = ZW(p.x);
        sc.shadow([bx + 2, 0.5, bz + 2], 9, 0.3);
        sc.sphere([bx, 9, bz], 9, isW && t >= b.winnerEnd ? GOLD : colorFor(r.index), { shine: 0.8 });
      }
      const res = r.kind === 'strike' ? 'STRIKE' : r.kind === 'gutter' ? 'GUTTER' : r.kind === 'split' ? '7-10 SPLIT' : `${r.down.length} PINS`;
      const after = isW ? t >= b.winnerEnd : t > th + 0.6;
      sc.label([lx, 30 + (r.lane % 2) * 26, PIN_Z - 10], after ? `${(names[r.index] ?? '').slice(0, 10)} · ${res}` : (names[r.index] ?? '').slice(0, 12), isW && t >= b.winnerEnd, -6);
      if (isW) sc.burst([lx, 20, PIN_Z - 20], t - b.winnerEnd + 0.3, 13, [GOLD, '#FFFFFF', '#E0412B'], 50, 120, 1.2, 120);
    }
    sc.flush();
  },
};
