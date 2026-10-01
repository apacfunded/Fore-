import { Game, GOLD, TAU, colorFor, lerp, playOrder, rng, winnerIndex } from './util';
import { Cam, Scene, V, add, cross, drift, lerp3, mul, norm, sky } from './r3d';

const CX = 500, CY = 228;
const RINGS = [{ pts: 10, r: 150 }, { pts: 20, r: 112 }, { pts: 30, r: 78 }, { pts: 40, r: 48 }];
const HOLE50 = 22;
const CUPS: [number, number][] = [[300, 78], [700, 78]];
const CUP_R = 18;
const FLY = 1.15, SINK = 0.3;

type Shot = { index: number; launch: number; x0: number; tx: number; ty: number; h: number; pts: number; rim?: { x: number; y: number } };
type D = { shots: Shot[] };

const flightTime = (s: Shot) => FLY + (s.rim ? 0.5 : 0) + SINK;

// 3D: a skee-ball alley. The target board is tilted back at the far end; 2D board coords map onto that plane.
const O: V = [0, 120, -420];
const BU: V = [1, 0, 0], BV: V = norm([0, 0.82, -0.57]), BN: V = norm(cross(BU, BV));
const onBoard = (x: number, y: number, lift = 0): V => add(add(O, add(mul(BU, (x - CX) * 0.9), mul(BV, (CY + 40 - y) * 0.9))), mul(BN, lift));
const START3 = (x0: number): V => [(x0 - 500) * 0.4, 12, 330];
const JUMP: V = [0, 34, -180];

function alley(sc: Scene, t: number, glow: number) {
  sc.custom(0, 0, () => sky(sc.ctx, '#1A0F08', '#3A2416'));
  sc.poly([[-1200, 0, -900], [1200, 0, -900], [1200, 0, 700], [-1200, 0, 700]], '#2A1A10', { layer: 1, light: false });
  // ramp lane up to the jump
  sc.poly([[-110, 2, 380], [110, 2, 380], [100, JUMP[1], JUMP[2]], [-100, JUMP[1], JUMP[2]]], '#9A6236', { layer: 1 });
  for (let k = -3; k <= 3; k++) sc.line([k * 30, 2.3, 380], [k * 28, JUMP[1] + 0.3, JUMP[2]], '#B07444', 1, { layer: 1 });
  sc.poly([[-100, JUMP[1], JUMP[2]], [100, JUMP[1], JUMP[2]], [100, JUMP[1] + 12, JUMP[2] - 26], [-100, JUMP[1] + 12, JUMP[2] - 26]], '#7A4A28', { layer: 1 });
  // side walls (glassy)
  for (const sx of [-1, 1]) {
    sc.poly([[sx * 112, 0, 380], [sx * 112, 0, -200], [sx * 112, 50, -200], [sx * 112, 50, 380]], '#6B3A1E', { layer: 1 });
    sc.box([sx * 300, 200, -470], 40, 420, 120, '#5A2F16', { layer: 1, top: '#6B3A1E' });
    sc.box([sx * 120, 26, 90], 10, 52, 580, '#7A4524', { top: '#8E5530' });
  }
  // board backing and rings, drawn biggest first so smaller ones sit on top
  const corners = [onBoard(200, 34), onBoard(800, 34), onBoard(800, 394), onBoard(200, 394)];
  sc.poly(corners, '#F2EAD8', { layer: 1, light: false });
  const cols = ['#E0412B', '#2F80ED', '#27AE60', '#F2994A'];
  RINGS.forEach((g, i) => {
    sc.disc(onBoard(CX, CY, 0.5 + i), g.r * 0.9, BN, cols[i], { layer: 1, light: false, segs: 40 });
    sc.disc(onBoard(CX, CY, 0.6 + i), (g.r - 6) * 0.9, BN, cols[i], { layer: 1, light: false, segs: 40, alpha: 0.35 });
    sc.text(onBoard(CX, CY + g.r - 14, 1 + i), String(g.pts), '#3A2414', 13, 1);
  });
  sc.disc(onBoard(CX, CY, 6), HOLE50 * 0.9, BN, '#140A05', { layer: 1, light: false, segs: 24 });
  sc.text(onBoard(CX, CY, 7), '50', '#FFFFFF', 13, 1);
  CUPS.forEach(([x, y]) => {
    sc.disc(onBoard(x, y, 1), (CUP_R + 8) * 0.9, BN, glow ? GOLD : '#C9A030', { layer: 1, light: false, segs: 24 });
    sc.disc(onBoard(x, y, 2), CUP_R * 0.9, BN, '#140A05', { layer: 1, light: false, segs: 22 });
    sc.text(onBoard(x, y + CUP_R + 20, 2), '100', GOLD, 14, 1);
  });
  // marquee lights
  for (let i = 0; i < 16; i++) sc.sphere(onBoard(220 + i * 37.5, 22, 4), 5, (Math.floor(t * (glow ? 14 : 5)) + i) % 2 ? GOLD : '#6A4A20', { shine: 0.8 });
}

export const skee: Game<D> = {
  key: 'skee',
  build(seed, n) {
    const { f, r, pick } = rng(seed, 0x5cee);
    const winner = winnerIndex(seed, n);
    const inRing = (pts: number) => {
      if (pts === 50) { const a = r(0, TAU), d = r(0, 8); return { x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d }; }
      const i = RINGS.findIndex((g) => g.pts === pts);
      const outer = RINGS[i].r - 10, inner = (RINGS[i + 1]?.r ?? HOLE50) + 6;
      const a = r(0.15 * Math.PI, 0.85 * Math.PI) * (f() < 0.75 ? 1 : -1), d = r(inner, outer);
      return { x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d };
    };
    const all: Shot[] = Array.from({ length: n }, (_, index) => {
      const x0 = r(430, 570), h = r(70, 150);
      if (index === winner) { const [cx, cy] = pick(CUPS); return { index, launch: 0, x0, tx: cx, ty: cy, h: r(150, 200), pts: 100 }; }
      const p = f();
      if (p < 0.08) { // rattles out of the 100 cup, drops to the 10 ring
        const [cx, cy] = pick(CUPS); const side = cx < CX ? 1 : -1;
        const land = { x: CX - side * r(120, 134), y: CY + r(-30, 20) };
        return { index, launch: 0, x0, tx: land.x, ty: land.y, h: r(150, 200), pts: 10, rim: { x: cx + side * CUP_R * 0.9, y: cy + 4 } };
      }
      const pts = p < 0.42 ? 10 : p < 0.66 ? 20 : p < 0.83 ? 30 : p < 0.94 ? 40 : 50;
      const tgt = inRing(pts);
      return { index, launch: 0, x0, tx: tgt.x, ty: tgt.y, h, pts };
    });
    const order = playOrder(f, n, winner, 60);
    const gap = Math.min(0.5, 9 / order.length);
    const shots = order.map((i, k) => ({ ...all[i], launch: k * gap }));
    const w = shots.find((s) => s.index === winner)!;
    const winnerEnd = w.launch + FLY + 0.15;
    const total = Math.max(...shots.map((s) => s.launch + flightTime(s)), winnerEnd) + 4;
    return {
      winner, winnerEnd, total, winPoint: [w.tx, w.ty], data: { shots },
      results: all.map((s) => ({ index: s.index, score: s.pts + (s.rim ? 1 : 0), text: s.pts === 100 ? 'Sank the 100' : s.rim ? 'Rattled out of the 100 · 10' : `Scored ${s.pts}` })),
    };
  },
  draw(ctx, t, b, names, waiting) {
    const glow = b && t >= b.winnerEnd ? 1 : 0;
    const cam = new Cam([drift(t, 50), 250, 230], [0, 175, -420], 50);
    const sc = new Scene(ctx, cam);
    alley(sc, t, glow);
    const ball = (p: V, col: string, a = 1, r = 11) => { sc.sphere(p, r, col, { alpha: a, shine: 0.7 }); };
    if (!b) { for (let i = 0; i < Math.min(waiting, 8); i++) ball([-80 + i * 22, 13, 360], colorFor(i)); sc.flush(); return; }
    const flying: { s: Shot; p: V }[] = [];
    for (const s of b.data.shots) {
      const e = t - s.launch;
      if (e < 0) continue;
      const isW = s.index === b.winner;
      const col = isW && t >= b.winnerEnd - 0.2 ? GOLD : colorFor(s.index);
      const roll = 0.45, air = FLY - roll;
      if (e < roll) { const p = e / roll; const pos = lerp3(START3(s.x0), JUMP, p); sc.shadow([pos[0], pos[1] - 10, pos[2]], 10, 0.25); ball(add(pos, [0, 0, 0]), col); flying.push({ s, p: pos }); continue; }
      const tgt = s.rim ? onBoard(s.rim.x, s.rim.y, 10) : onBoard(s.tx, s.ty, 10);
      if (e < FLY) { const p = (e - roll) / air; const pos = add(lerp3(JUMP, tgt, p), [0, Math.sin(Math.PI * p) * 60, 0]); ball(pos, col); flying.push({ s, p: pos }); continue; }
      let e2 = e - FLY;
      if (s.rim) {
        if (e2 < 0.5) { const p = e2 / 0.5; const pos = add(lerp3(tgt, onBoard(s.tx, s.ty, 10), p), mul(BN, Math.sin(Math.PI * p) * 40)); ball(pos, col); continue; }
        e2 -= 0.5;
      }
      if (e2 < SINK) { const p = e2 / SINK; ball(onBoard(s.tx, s.ty, 10 - p * 16), col, 1 - p, 11 * (1 - p * 0.5)); }
      const since = e2 - SINK;
      if (since > -SINK && since < 0.9 && !isW) sc.text(onBoard(s.tx, s.ty, 24 + Math.max(0, since) * 40), `+${s.pts}`, '#3A2414', 18);
    }
    for (const f of flying.slice(-2)) sc.label(f.p, names[f.s.index] ?? '', false, -30);
    const w = b.data.shots.find((x) => x.index === b.winner);
    if (w) sc.burst(onBoard(w.tx, w.ty, 20), t - b.winnerEnd, 77, [GOLD, '#FFFFFF', '#E0412B'], 50, 140, 1.2, 100);
    sc.flush();
  },
};
