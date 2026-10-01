import { Game, GOLD, TAU, easeInOut, colorFor, lerp, mulberry32, playOrder, rng, winnerIndex } from './util';
import { Cam, Scene, drift, lerp3, sky } from './r3d';

const FLOOR = 440, RIM_F = 800, RIM_B = 852, RIM_Y = 190, BOARD_X = 862;
type Seg = { x0: number; y0: number; x1: number; y1: number; h: number; d: number };
type Kind = 'swish' | 'rim' | 'back' | 'glass' | 'air';
type Shot = { index: number; launch: number; kind: Kind; segs: Seg[]; dur: number };
type D = { shots: Shot[] };

const posAt = (s: Shot, e: number) => {
  if (e < 0) return null;
  let acc = 0;
  for (const g of s.segs) {
    if (e <= acc + g.d) { const p = (e - acc) / g.d; return { x: lerp(g.x0, g.x1, p), y: lerp(g.y0, g.y1, p) - 4 * g.h * p * (1 - p) }; }
    acc += g.d;
  }
  return null;
};

function makeShot(kind: Kind, r: (a: number, b: number) => number): Seg[] {
  const x0 = r(80, 300), y0 = r(360, 395);
  const arc = (x1: number, y1: number, h: number, d: number): Seg => ({ x0: 0, y0: 0, x1, y1, h, d });
  const chain = (list: Seg[]) => { let x = x0, y = y0; return list.map((s) => { const out = { ...s, x0: x, y0: y }; x = s.x1; y = s.y1; return out; }); };
  const cx = (RIM_F + RIM_B) / 2;
  const big = r(170, 225), d = r(1.2, 1.45);
  if (kind === 'swish') return chain([arc(cx, RIM_Y - 4, big, d), arc(cx, RIM_Y + 50, 0, 0.28), arc(cx - 10, FLOOR - 11, 0, 0.35), arc(cx - 50, FLOOR - 11, 40, 0.5)]);
  if (kind === 'rim') return chain([arc(RIM_F + 4, RIM_Y - 10, big, d), arc(RIM_F - r(70, 140), FLOOR - 11, r(40, 80), 0.75), arc(RIM_F - r(160, 220), FLOOR - 11, 25, 0.5)]);
  if (kind === 'back') return chain([arc(RIM_B - 6, RIM_Y - 10, big, d), arc(RIM_F - r(20, 80), RIM_Y - 6, r(50, 80), 0.55), arc(RIM_F - r(120, 200), FLOOR - 11, 30, 0.6)]);
  if (kind === 'glass') return chain([arc(BOARD_X - 10, r(110, 160), big, d), arc(RIM_F - r(60, 140), FLOOR - 11, 10, 0.75), arc(RIM_F - r(160, 240), FLOOR - 11, 20, 0.45)]);
  return chain([arc(r(640, 760), FLOOR - 11, big * 0.9, d), arc(r(560, 620), FLOOR - 11, 30, 0.5)]);
}

// 3D: court axis along X (2D x -> X = x - 500), height Y = FLOOR - y, shooters spread in Z and converge on the rim.
const HX = (RIM_F + RIM_B) / 2 - 500, HY = FLOOR - RIM_Y, RIM_R = (RIM_B - RIM_F) / 2;
const spread = (index: number, winner: number) => (index === winner ? 0 : (mulberry32(index * 389 + 9)() - 0.5) * 260);

function court(sc: Scene, t: number, swish: number) {
  sc.custom(0, 0, () => sky(sc.ctx, '#141826', '#2C3550'));
  // stands
  for (let r = 0; r < 4; r++) sc.box([0, 30 + r * 40, -420 - r * 40], 1800, 40, 40, r % 2 ? '#262C40' : '#2E3550', { layer: 1, top: '#3A4260' });
  const fr = mulberry32(7);
  for (let i = 0; i < 140; i++) { const r = Math.floor(fr() * 4); sc.sphere([-850 + fr() * 1700, 58 + r * 40, -420 - r * 40 + 4], 7, ['#E0412B', '#2F80ED', '#F2C230', '#FFFFFF', '#27AE60'][i % 5], { shine: 0.2, layer: 1 }); }
  // floor
  for (let i = 0; i < 26; i++) sc.poly([[-900 + i * 70, 0, -380], [-830 + i * 70, 0, -380], [-830 + i * 70, 0, 420], [-900 + i * 70, 0, 420]], i % 2 ? '#C98A4B' : '#D0924F', { layer: 1, light: false });
  sc.poly([[HX - 230, 0.2, -90], [HX + 30, 0.2, -90], [HX + 30, 0.2, 90], [HX - 230, 0.2, 90]], '#B5462F', { layer: 1, light: false, alpha: 0.85 });
  sc.disc([HX - 230, 0.3, 0], 90, [0, 1, 0], '#B5462F', { layer: 1, light: false, alpha: 0.85, segs: 30 });
  sc.line([-170, 0.3, -380], [-170, 0.3, 420], '#FFFFFF', 2, { layer: 1 });
  // pole, arm, backboard
  const BX = BOARD_X - 500;
  sc.tube([BX + 40, 0, 0], [BX + 40, FLOOR - 160, 0], 7, '#5A606C', { segs: 10 });
  sc.box([BX + 22, FLOOR - 160, 0], 40, 8, 10, '#5A606C');
  sc.box([BX + 2, FLOOR - 165, 0], 6, 130, 120, '#CFE3FF', { alpha: 0.45, light: false });
  sc.box([BX + 1, FLOOR - 210, 0], 7, 3, 40, '#FFFFFF'); 
  for (const dz of [-60, 60]) sc.box([BX + 1, FLOOR - 165, dz], 7, 130, 3, '#FFFFFF');
  for (const dy of [-65, 65]) sc.box([BX + 1, FLOOR - 165 + dy, 0], 7, 3, 120, '#FFFFFF');
  // rim + net
  const sway = swish > 0 && swish < 0.6 ? Math.sin(swish * 30) * 3 * (1 - swish / 0.6) : 0;
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a1 = (i / N) * TAU, a2 = ((i + 1) / N) * TAU;
    const p1: [number, number, number] = [HX + Math.cos(a1) * RIM_R, HY, Math.sin(a1) * RIM_R], p2: [number, number, number] = [HX + Math.cos(a2) * RIM_R, HY, Math.sin(a2) * RIM_R];
    sc.tube(p1, p2, 1.8, '#E0412B', { segs: 5, cap: false });
    sc.line(p1, [HX + Math.cos(a1) * RIM_R * 0.6 + sway, HY - 40, Math.sin(a1) * RIM_R * 0.6], '#FFFFFF', 0.7, { alpha: 0.85 });
  }
  sc.box([HX + RIM_R + 6, HY, 0], 12, 3, 8, '#E0412B');
}

function ball3(sc: Scene, x: number, y: number, z: number, col: string, rot: number) {
  sc.shadow([x + 4, 0.4, z + 2], 11 * Math.max(0.35, 1 - y / 500), 0.3);
  sc.sphere([x, y, z], 11, col, { shine: 0.55 });
  const p = sc.cam.p([x, y, z]);
  if (p) sc.custom(2, p.z - 0.5, () => { const g = sc.ctx, r = 11 * p.s; g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = Math.max(0.6, r * 0.09); g.beginPath(); g.arc(p.x, p.y, r * 0.98, rot, rot + Math.PI); g.stroke(); g.beginPath(); g.moveTo(p.x + Math.cos(rot) * r, p.y + Math.sin(rot) * r); g.lineTo(p.x - Math.cos(rot) * r, p.y - Math.sin(rot) * r); g.stroke(); });
}

export const hoops: Game<D> = {
  key: 'hoops',
  build(seed, n) {
    const { f, r } = rng(seed, 0x4005);
    const winner = winnerIndex(seed, n);
    const kinds: Kind[] = Array.from({ length: n }, (_, i) => { if (i === winner) return 'swish'; const p = f(); return p < 0.3 ? 'rim' : p < 0.5 ? 'back' : p < 0.75 ? 'glass' : 'air'; });
    const order = playOrder(f, n, winner, 50);
    const gap = Math.min(0.55, 8 / order.length);
    const shots: Shot[] = order.map((index, k) => { const segs = makeShot(kinds[index], r); return { index, launch: k * gap, kind: kinds[index], segs, dur: segs.reduce((s, g) => s + g.d, 0) }; });
    const w = shots.find((s) => s.index === winner)!;
    const winnerEnd = w.launch + w.segs[0].d + 0.25;
    const total = Math.max(...shots.map((s) => s.launch + s.dur), winnerEnd) + 4;
    const label: Record<Kind, string> = { swish: 'Swish', rim: 'Rimmed out', back: 'Off the back iron', glass: 'Brick off the glass', air: 'Airball' };
    const score: Record<Kind, number> = { swish: 99, rim: 4, back: 3, glass: 2, air: 0 };
    return {
      winner, winnerEnd, total, winPoint: [(RIM_F + RIM_B) / 2, RIM_Y + 20], data: { shots },
      results: kinds.map((k, index) => ({ index, text: label[k], score: score[k] })),
    };
  },
  draw(ctx, t, b, names, waiting) {
    const k = b ? easeInOut(Math.max(0, Math.min(1, (t - 0.5) / Math.max(1, b.winnerEnd - 1)))) : 0;
    const cam = new Cam(lerp3([-90 + drift(t, 50), 250, 500], [170 + drift(t, 20), 250, 300], k), lerp3([120, 190, 0], [270, 215, 0], k), 52);
    const sc = new Scene(ctx, cam);
    if (!b) {
      court(sc, t, -1);
      for (let i = 0; i < Math.min(waiting, 8); i++) ball3(sc, -380 + i * 26, 11, 120 - i * 10, colorFor(i), t + i);
      sc.flush(); return;
    }
    let swish = -1;
    const w = b.data.shots.find((s) => s.index === b.winner);
    if (w) swish = t - (w.launch + w.segs[0].d);
    court(sc, t, swish);
    const flying: { s: Shot; p: [number, number, number] }[] = [];
    for (const s of b.data.shots) {
      const e = t - s.launch;
      const p = posAt(s, e);
      if (!p) continue;
      const isW = s.index === b.winner;
      const z0 = spread(s.index, b.winner);
      const prog = Math.min(1, e / s.segs[0].d);
      const z = s.kind === 'swish' ? 0 : z0 * (1 - prog * 0.92);
      const pos: [number, number, number] = [p.x - 500, FLOOR - p.y, z];
      ball3(sc, pos[0], pos[1], pos[2], isW && t >= b.winnerEnd ? GOLD : colorFor(s.index), e * 8);
      if (e < s.segs[0].d) flying.push({ s, p: pos });
    }
    for (const f of flying.slice(-2)) sc.label(f.p, names[f.s.index] ?? '', false, -34);
    sc.burst([HX, HY - 10, 0], t - b.winnerEnd, 21, [GOLD, '#FFFFFF', '#E0412B'], 50, 130, 1.2, 120);
    sc.flush();
  },
};
