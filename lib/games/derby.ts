import { Game, GOLD, TAU, colorFor, mulberry32, ordinal, rng, winnerIndex } from './util';
import { Cam, Scene, drift, sky } from './r3d';

const LANES = 8, TOPY = 64, LH = 50, START = 150, FINISH = 900, T_WIN = 9;
const laneY = (l: number) => TOPY + l * LH + LH / 2;

type Racer = { index: number; lane: number; T: number; a: number; fq: number; sgn: number; win: boolean };
type D = { racers: Racer[] };

function progress(r: Racer, t: number) {
  if (t <= 0) return 0;
  const u = t / r.T;
  if (u >= 1) return 1 + (t - r.T) * 0.03;
  // Winner hangs back mid-race then surges; others surge and fade at their own rhythm.
  if (r.win) return u - (0.55 * Math.sin(Math.PI * u)) / Math.PI;
  return u + (r.sgn * r.a * Math.sin(TAU * r.fq * u)) / (TAU * r.fq);
}

// 3D: lanes run along X; lane l sits at Z = laneZ(l). The camera tracks the leading duck.
const LW = 60;
const laneZ = (l: number) => (l - (LANES - 1) / 2) * LW;
const XW = (x: number) => x - 525;

function water(sc: Scene, t: number) {
  sc.custom(0, 0, () => sky(sc.ctx, '#5FA6D6', '#D7ECF5', 0.5));
  sc.poly([[-2000, -2, -1400], [2000, -2, -1400], [2000, -2, 900], [-2000, -2, 900]], '#3E8F4E', { layer: 1, light: false });
  const z0 = laneZ(0) - LW / 2, z1 = laneZ(LANES - 1) + LW / 2;
  sc.poly([[-900, 0, z0 - 20], [900, 0, z0 - 20], [900, 0, z1 + 20], [-900, 0, z1 + 20]], '#2F86C8', { layer: 1, light: false });
  for (let l = 0; l < LANES; l++) if (l % 2) sc.poly([[-900, 0.1, laneZ(l) - LW / 2], [900, 0.1, laneZ(l) - LW / 2], [900, 0.1, laneZ(l) + LW / 2], [-900, 0.1, laneZ(l) + LW / 2]], '#3A95D8', { layer: 1, light: false });
  for (let i = 0; i < 26; i++) { const f = mulberry32(i * 13 + 1); const x = -900 + ((f() * 1800 + t * 25) % 1800), z = z0 + f() * (z1 - z0); sc.line([x, 0.2, z], [x + 30, 0.2, z], '#FFFFFF', 1, { layer: 1, alpha: 0.25 }); }
  // lane ropes with floats
  for (let l = 0; l <= LANES; l++) { const z = laneZ(l) - LW / 2; for (let x = -700; x <= 700; x += 45) sc.sphere([x, 2, z], 4, ((x + 700) / 45) % 2 ? '#F2F2F2' : '#E0412B', { shine: 0.5 }); }
  // banks
  sc.box([0, 6, z0 - 40], 1800, 12, 40, '#C7B58A', { top: '#D8C89E' });
  sc.box([0, 6, z1 + 40], 1800, 12, 40, '#C7B58A', { top: '#D8C89E' });
  // start and finish
  for (let i = 0; i < 18; i++) for (let c = 0; c < 2; c++) { const z = z0 + i * ((z1 - z0) / 18); sc.poly([[XW(FINISH) + c * 10, 0.3, z], [XW(FINISH) + c * 10 + 10, 0.3, z], [XW(FINISH) + c * 10 + 10, 0.3, z + (z1 - z0) / 18], [XW(FINISH) + c * 10, 0.3, z + (z1 - z0) / 18]], (i + c) % 2 ? '#111111' : '#FFFFFF', { layer: 1, light: false }); }
  for (const zz of [z0 - 30, z1 + 30]) sc.cyl([XW(FINISH) + 10, 0, zz], 5, 120, '#EDEDED', { segs: 8 });
  sc.box([XW(FINISH) + 10, 125, (z0 + z1) / 2], 10, 26, z1 - z0 + 70, '#E0412B', { top: '#F05A44' });
  sc.custom(9, 0, () => { const p = sc.cam.p([XW(FINISH) + 10, 125, (z0 + z1) / 2]); if (!p) return; const g = sc.ctx; g.font = `700 ${Math.max(10, Math.min(22, 14 * p.s))}px ui-monospace, monospace`; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText('FINISH', p.x, p.y + 5); });
  sc.line([XW(START), 0.3, z0], [XW(START), 0.3, z1], '#FFFFFF', 2, { layer: 1 });
}

function duck3(sc: Scene, x: number, z: number, col: string, bob: number, a = 1) {
  const y = 6 + Math.sin(bob) * 1.5;
  sc.disc([x - 22, 0.4, z], 10, [0, 1, 0], '#FFFFFF', { layer: 1, light: false, alpha: 0.35 * a, segs: 12 });
  sc.sphere([x - 4, y + 6, z], 14, col, { alpha: a, shine: 0.45 });
  sc.sphere([x - 15, y + 10, z], 8, col, { alpha: a, shine: 0.4 });
  sc.sphere([x + 10, y + 22, z], 9, col, { alpha: a, shine: 0.45 });
  sc.tube([x + 17, y + 21, z], [x + 27, y + 19, z], 3.5, '#F2994A', { r2: 1, segs: 6 });
  sc.sphere([x + 14, y + 25, z + 6], 1.8, '#111111', { shine: 0.8 });
  sc.sphere([x + 14, y + 25, z - 6], 1.8, '#111111', { shine: 0.8 });
}

export const derby: Game<D> = {
  key: 'derby',
  build(seed, n) {
    const { f, r, pick } = rng(seed, 0xd0c4);
    const winner = winnerIndex(seed, n);
    const gaps = Array.from({ length: n }, (_, i) => (i === winner ? 0 : 0.05 + Math.pow(f(), 1.8) * 3.2));
    const byFinish = Array.from({ length: n }, (_, i) => i).sort((a, b) => gaps[a] - gaps[b] || a - b);
    const place = new Map(byFinish.map((idx, k) => [idx, k + 1]));
    const shown = byFinish.slice(0, LANES);
    const lanes = shown.map((_, i) => i);
    for (let i = lanes.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [lanes[i], lanes[j]] = [lanes[j], lanes[i]]; }
    const off = Math.floor((LANES - shown.length) / 2);
    const racers: Racer[] = shown.map((index, k) => ({
      index, lane: lanes[k] + off, T: T_WIN + gaps[index], a: r(0.3, 0.85), fq: pick([1, 1.5, 2]), sgn: f() < 0.5 ? 1 : -1, win: index === winner,
    }));
    const winnerEnd = T_WIN + 0.6; // ducks leave the gate 0.4s into playback
    const total = Math.max(...racers.map((x) => x.T)) + 3.4;
    return {
      winner, winnerEnd, total, winPoint: [FINISH, laneY(racers.find((x) => x.win)!.lane)], data: { racers },
      results: Array.from({ length: n }, (_, index) => ({
        index, score: -place.get(index)!,
        text: index === winner ? '1st' : `${ordinal(place.get(index)!)} · +${gaps[index].toFixed(2)}s`,
      })),
    };
  },
  draw(ctx, t, b, names, waiting) {
    const xOf = (r: Racer) => XW(START - 22 + (FINISH - START + 22) * progress(r, Math.max(0, t - 0.4)));
    let lead = XW(START);
    if (b) for (const r of b.data.racers) lead = Math.max(lead, Math.min(xOf(r), XW(FINISH) + 40));
    const cx = Math.max(XW(START) + 120, Math.min(lead, XW(FINISH) - 60));
    const cam = new Cam([cx - 330, 210, 470 + drift(t, 30)], [cx + 60, 0, 0], 42);
    const sc = new Scene(ctx, cam);
    water(sc, t);
    if (!b) { for (let i = 0; i < Math.min(waiting, LANES); i++) duck3(sc, XW(START) - 25, laneZ(i), colorFor(i), t * 3 + i); sc.flush(); return; }
    const byT = [...b.data.racers].sort((p1, p2) => p1.T - p2.T);
    const ranked = [...b.data.racers].sort((x, y) => progress(y, t) - progress(x, t));
    for (const r of b.data.racers) {
      const x = Math.min(xOf(r), XW(FINISH) + 90), z = laneZ(r.lane);
      const won = r.win && t >= b.winnerEnd;
      duck3(sc, x, z, won ? GOLD : colorFor(r.index), t * 6 + r.lane);
      const done = t - 0.4 >= r.T;
      if (done || ranked.indexOf(r) < 3 || won) sc.label([x, 40, z], done ? `${ordinal(byT.indexOf(r) + 1)} · ${names[r.index] ?? ''}` : names[r.index] ?? '', won, -22);
      if (r.win) sc.burst([XW(FINISH), 30, z], t - b.winnerEnd, 41, [GOLD, '#FFFFFF', '#E0412B'], 50, 140, 1.2, 120);
    }
    sc.flush();
  },
};
