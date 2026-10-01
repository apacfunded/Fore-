import { Game, W, H, GOLD, TAU, clamp, colorFor, ordinal, rng, shuffle, winnerIndex } from './util';
import { Cam, Scene, V, drift, sky } from './r3d';

const CX = 500, CY = 244, RING = 196, FIRST_OUT = 1.4, LAST_OUT = 11, FLY = 0.75;
type M = { rho: number; th: number; a1: number; w1: number; p1: number; a2: number; w2: number; p2: number };
type D = { ms: M[]; out: number[]; by: number[]; dir: [number, number][]; rad: number };

function pos(m: M, t: number): [number, number] {
  const squeeze = Math.max(0.22, 1 - t / 13);
  const x = Math.cos(m.th) * m.rho * squeeze + Math.sin(m.w1 * t + m.p1) * m.a1;
  const y = Math.sin(m.th) * m.rho * squeeze + Math.cos(m.w2 * t + m.p2) * m.a2;
  const d = Math.hypot(x, y), lim = RING - 30;
  const k = d > lim ? lim / d : 1;
  return [CX + x * k, CY + y * k];
}

// 3D: a raised clay ring (dohyo). 2D ring coords map to X = x - CX, Z = y - CY on the platform top.
const TOP = 34, PLAT = RING + 34;
const WP = (x: number, y: number, h = 0): V => [x - CX, TOP + h, y - CY];

function arena(sc: Scene, t: number) {
  sc.custom(0, 0, () => sky(sc.ctx, '#1A0E08', '#3A2416'));
  sc.poly([[-1400, 0, -1000], [1400, 0, -1000], [1400, 0, 800], [-1400, 0, 800]], '#2A1A10', { layer: 1, light: false });
  for (let i = -6; i <= 6; i++) sc.line([i * 120, 0.1, -1000], [i * 120, 0.1, 400], '#33210F', 1.5, { layer: 1 });
  // square base then the round platform
  sc.box([0, TOP / 2 - 6, 0], PLAT * 2 + 40, TOP - 12, PLAT * 2 + 40, '#A98353', { top: '#C9A46A', layer: 1 });
  sc.cyl([0, TOP - 12, 0], PLAT, 12, '#C29A60', { segs: 40, cap: '#D8B47A', layer: 1 });
  // straw rope ring
  const segs = 48;
  for (let i = 0; i < segs; i++) {
    const a1 = (i / segs) * TAU, a2 = ((i + 1) / segs) * TAU;
    sc.tube([Math.cos(a1) * RING, TOP + 3, Math.sin(a1) * RING], [Math.cos(a2) * RING, TOP + 3, Math.sin(a2) * RING], 5, '#EADBA8', { segs: 6, cap: false });
  }
  sc.box([-28, TOP + 0.5, -18], 26, 1, 4, '#FFFFFF', { light: false }); sc.box([28, TOP + 0.5, 18], 26, 1, 4, '#FFFFFF', { light: false });
  // corner tassels/banners
  ([['#2F80ED', -1, -1], ['#E0412B', 1, -1], ['#F2F2F2', 1, 1], ['#151515', -1, 1]] as [string, number, number][]).forEach(([c, sx, sz]) => {
    const x = sx * (PLAT + 70), z = sz * (PLAT + 70);
    sc.cyl([x, 0, z], 5, 150, '#5A3A22', { segs: 6 });
    sc.box([x, 125 + Math.sin(t * 1.5 + sx) * 3, z], 40, 50, 5, c);
  });
}

function marble3(sc: Scene, p: V, r: number, col: string, a = 1, onTop = true) {
  if (onTop) sc.shadow([p[0] + 3, TOP + 0.3, p[2] + 2], r * 0.95, 0.28 * a);
  sc.sphere([p[0], p[1] + r, p[2]], r, col, { alpha: a, shine: 0.75 });
}

export const sumo: Game<D> = {
  key: 'sumo',
  build(seed, n) {
    const { f, r } = rng(seed, 0x5a40);
    const winner = winnerIndex(seed, n);
    const rad = clamp(17 - n * 0.09, 6, 17);
    const ms: M[] = Array.from({ length: n }, () => ({
      rho: Math.sqrt(f()) * (RING - 50), th: r(0, TAU), a1: r(10, 26), w1: r(1.2, 3.2), p1: r(0, TAU), a2: r(10, 26), w2: r(1.2, 3.2), p2: r(0, TAU),
    }));
    const losers = shuffle(f, Array.from({ length: n }, (_, i) => i).filter((i) => i !== winner));
    const out = Array.from({ length: n }, () => Infinity);
    losers.forEach((i, k) => { out[i] = FIRST_OUT + (LAST_OUT - FIRST_OUT) * Math.pow((k + 1) / losers.length, 0.7); });
    const by = Array.from({ length: n }, () => -1);
    const dir: [number, number][] = Array.from({ length: n }, () => [1, 0]);
    for (const i of losers) {
      const te = out[i];
      const [x, y] = pos(ms[i], te);
      let best = -1, bd = Infinity;
      for (let j = 0; j < n; j++) {
        if (j === i || out[j] <= te) continue;
        const [x2, y2] = pos(ms[j], te);
        const d = Math.hypot(x - x2, y - y2);
        if (d < bd) { bd = d; best = j; }
      }
      by[i] = best;
      let dx = x - CX, dy = y - CY;
      if (best >= 0) { const [x2, y2] = pos(ms[best], te); dx = x - x2 + (x - CX) * 0.6; dy = y - y2 + (y - CY) * 0.6; }
      const L = Math.hypot(dx, dy) || 1; dir[i] = [dx / L, dy / L];
    }
    const place = new Map<number, number>([[winner, 1]]);
    [...losers].reverse().forEach((i, k) => place.set(i, k + 2));
    const winnerEnd = n > 1 ? LAST_OUT + FLY + 0.3 : 1.5;
    return {
      winner, winnerEnd, total: winnerEnd + 3.5, winPoint: pos(ms[winner], winnerEnd), data: { ms, out, by, dir, rad },
      results: Array.from({ length: n }, (_, index) => ({
        index, score: -place.get(index)!, by: by[index] >= 0 ? by[index] : undefined,
        text: index === winner ? 'Last one standing' : `${ordinal(place.get(index)!)} · knocked out`,
      })),
    };
  },
  draw(ctx, t, b, names, waiting) {
    const cam = new Cam([Math.sin(t * 0.12) * 280, 560, 600 + Math.cos(t * 0.12) * 60], [0, 0, 30], 40);
    const sc = new Scene(ctx, cam);
    arena(sc, t);
    if (!b) {
      const k = Math.min(waiting, 12);
      for (let i = 0; i < k; i++) { const a = (i / Math.max(k, 1)) * TAU + t * 0.4; marble3(sc, WP(CX + Math.cos(a) * 120, CY + Math.sin(a) * 120), 15, colorFor(i)); }
      sc.flush(); return;
    }
    const { ms, out, dir, rad } = b.data;
    const r3 = rad * 1.1;
    const alive: number[] = [];
    ms.forEach((m, i) => {
      const te = out[i];
      if (t < te) { alive.push(i); const [x, y] = pos(m, t); marble3(sc, WP(x, y), r3, i === b.winner && t >= b.winnerEnd ? GOLD : colorFor(i)); return; }
      const e = t - te;
      if (e > 1.6) return;
      const [x0, y0] = pos(m, te);
      const d = 330 * (1 - Math.pow(1 - Math.min(1, e / FLY), 2));
      const x = x0 + dir[i][0] * d, y = y0 + dir[i][1] * d;
      const off = Math.hypot(x - CX, y - CY) > PLAT;
      let h = 0;
      if (off) { const tOff = FLY * (1 - Math.sqrt(Math.max(0, 1 - (PLAT - Math.hypot(x0 - CX, y0 - CY)) / 330))); h = -500 * Math.pow(Math.max(0, e - tOff), 2); }
      marble3(sc, WP(x, y, Math.max(-TOP, h)), r3, colorFor(i), e > 1.1 ? 1 - (e - 1.1) / 0.5 : 1, !off);
      if (e < 0.4) sc.burst(WP(x0, y0, 6), e, i * 17 + 1, ['#FFFFFF', '#F2E2B8', '#D8B47A'], 12, 60, 0.4, 50);
    });
    if (alive.length <= 6) for (const i of alive) { const [x, y] = pos(ms[i], t); sc.label(WP(x, y, r3 * 2), names[i] ?? '', i === b.winner && t >= b.winnerEnd, -26); }
    sc.custom(9, 0, () => { const g = sc.ctx; g.font = '700 12px ui-monospace, monospace'; g.textAlign = 'right'; g.fillStyle = '#F2E2B8'; g.fillText(`${alive.length} left in the ring`, W - 16, H - 14); });
    const [wx, wy] = pos(ms[b.winner], t);
    sc.burst(WP(wx, wy, 20), t - b.winnerEnd, 3, [GOLD, '#FFFFFF', '#E0412B'], 50, 150, 1.2, 120);
    sc.flush();
  },
};
