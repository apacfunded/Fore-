import { Game, W, H, GOLD, TAU, clamp01, easeInOut, colorFor, mulberry32, playOrder, rng, shuffle, winnerIndex } from './util';
import { Cam, Scene, V, add, cross, drift, lerp3, mul, norm, sky, sub } from './r3d';

const PAD = 448, MOON: [number, number] = [500, 70], MOON_R = 48, TOP_Y = MOON[1] + MOON_R - 6, TF = 6.2, EXP = 1.6;
type Kind = 'land' | 'boom' | 'fizzle';
type Rocket = { index: number; launch: number; x0: number; f: number; kind: Kind; wob: number };
type D = { rockets: Rocket[] };
const KM = 384400;

const alt = (tau: number) => Math.pow(clamp01(tau / TF), EXP);
const dieAt = (f: number) => TF * Math.pow(f, 1 / EXP);

// 3D world: launch field on the ground (y = 0), the moon hangs high and far away.
const MOON3: V = [0, 600, -620], MOON3_R = 230;
const HIGH = 560; // altitude scale for losers
const depthOf = (index: number) => (mulberry32(index * 733 + 1)() - 0.5) * 360;
const padOf = (r: Rocket): V => [(r.x0 - 500) * 1.05, 0, depthOf(r.index)];
const landAt = (): V => add(MOON3, mul(norm(sub([0, 0, 300], MOON3)), MOON3_R + 6));
const starField = (() => { const f = mulberry32(42); return Array.from({ length: 170 }, () => [f() * W, f() * H * 0.8, f() * 1.6 + 0.4, f() * TAU]); })();

function pos3(r: Rocket, tau: number): V {
  const a = alt(tau), pad = padOf(r);
  if (r.kind === 'land') {
    const end = landAt();
    const p = lerp3(pad, end, Math.pow(a, 1.15));
    return [p[0], pad[1] + (end[1] - pad[1]) * a, p[2]];
  }
  return [pad[0] + Math.sin(tau * 1.3 + r.wob) * 18 * a, a * HIGH * 1.05, pad[2] + Math.cos(tau * 0.9 + r.wob) * 14 * a];
}

function space(sc: Scene, t: number) {
  sc.custom(0, 0, () => {
    sky(sc.ctx, '#03040C', '#1B1640');
    for (const [x, y, s2, p] of starField) { sc.ctx.globalAlpha = 0.45 + 0.55 * Math.sin(t * 2 + p); sc.ctx.fillStyle = '#fff'; sc.ctx.fillRect(x, y, s2, s2); }
    sc.ctx.globalAlpha = 1;
  });
  // moon with craters facing us
  const mp = sc.cam.p(MOON3);
  if (mp) sc.custom(0, 1, () => { const g = sc.ctx, R = MOON3_R * mp.s * 1.35; const gr = g.createRadialGradient(mp.x, mp.y, R * 0.6, mp.x, mp.y, R); gr.addColorStop(0, 'rgba(255,250,220,.18)'); gr.addColorStop(1, 'rgba(255,250,220,0)'); g.fillStyle = gr; g.beginPath(); g.arc(mp.x, mp.y, R, 0, TAU); g.fill(); });
  sc.sphere(MOON3, MOON3_R, '#E4E0CC', { shine: 0.25, bias: 2000 });
  const face = norm(sub(sc.cam.pos, MOON3));
  const right = norm(cross(face, [0, 1, 0])), up = cross(right, face);
  [[-0.35, 0.3, 0.2], [0.3, -0.15, 0.26], [-0.1, -0.45, 0.13], [0.45, 0.4, 0.1], [0.05, 0.1, 0.09]].forEach(([u, v, r], i) => {
    const c = add(MOON3, add(mul(face, MOON3_R * Math.sqrt(1 - u * u - v * v)), add(mul(right, u * MOON3_R), mul(up, v * MOON3_R))));
    sc.disc(c, r * MOON3_R, sub(c, MOON3), '#C7C2AA', { bias: 1990 - i, light: false, segs: 18 });
  });
  // ground
  sc.poly([[-1600, 0, -900], [1600, 0, -900], [1600, 0, 700], [-1600, 0, 700]], '#211A3E', { layer: 1, light: false });
  for (let x = -1600; x <= 1600; x += 100) sc.line([x, 0.1, -900], [x, 0.1, 380], '#3A2F66', 0.8, { layer: 1 });
  for (let z = -900; z <= 380; z += 100) sc.line([-1600, 0.1, z], [1600, 0.1, z], '#3A2F66', 0.8, { layer: 1 });
}

function rocket3(sc: Scene, pos: V, dir: V, col: string, flame: number, alpha = 1, t = 0) {
  const d = norm(dir);
  const tail = add(pos, mul(d, -16)), nose = add(pos, mul(d, 14)), tip = add(pos, mul(d, 26));
  const o = { alpha };
  sc.tube(tail, nose, 6.5, '#F1F2F8', { ...o, segs: 9 });
  sc.tube(nose, tip, 6.5, col, { ...o, segs: 9, r2: 0 });
  const side = norm(Math.abs(d[1]) > 0.9 ? cross(d, [0, 0, 1]) : cross(d, [0, 1, 0])), side2 = cross(d, side);
  for (const s of [side, mul(side, -1), side2, mul(side2, -1)]) sc.poly([add(tail, mul(s, 5)), add(add(tail, mul(s, 13)), mul(d, -6)), add(add(tail, mul(s, 5)), mul(d, 12))], col, { ...o });
  sc.sphere(add(add(pos, mul(d, 4)), mul(norm(sub(sc.cam.pos, pos)), 6)), 2.6, '#5AB4FF', { ...o, shine: 0.8 });
  if (flame > 0) {
    const fl = 0.75 + 0.25 * Math.sin(t * 45 + pos[0]);
    sc.sphere(add(tail, mul(d, -7 * fl)), 6 * fl, '#FFB020', { alpha: 0.9 * alpha, shine: 1 });
    sc.sphere(add(tail, mul(d, -13 * fl)), 4 * fl, '#FF6A2A', { alpha: 0.7 * alpha, shine: 0.8 });
  }
}

export const moon: Game<D> = {
  key: 'moon',
  build(seed, n) {
    const { f, r } = rng(seed, 0x3009);
    const winner = winnerIndex(seed, n);
    const fs = Array.from({ length: n }, (_, i) => (i === winner ? 1 : Math.min(0.96, 0.06 + 0.9 * Math.pow(f(), 1.3))));
    const kinds: Kind[] = Array.from({ length: n }, (_, i) => (i === winner ? 'land' : f() < 0.3 ? 'fizzle' : 'boom'));
    const order = playOrder(f, n, winner, 40);
    const slots = shuffle(f, order.map((_, k) => k));
    const span = W - 120;
    const gap = Math.min(0.35, 3 / order.length);
    const rockets: Rocket[] = order.map((index, k) => ({
      index, launch: k * gap, f: fs[index], kind: kinds[index], wob: r(0, TAU),
      x0: 60 + (order.length === 1 ? span / 2 : (slots[k] / (order.length - 1)) * span),
    }));
    const w = rockets.find((x) => x.index === winner)!;
    const winnerEnd = w.launch + TF + 0.2;
    const total = Math.max(winnerEnd, ...rockets.map((x) => x.launch + dieAt(x.f) + 1.4)) + 3.5;
    const km = (p: number) => (Math.round((p * KM) / 100) * 100).toLocaleString('en-US');
    return {
      winner, winnerEnd, total, winPoint: [MOON[0], TOP_Y], data: { rockets },
      results: fs.map((p, index) => ({ index, score: p, text: index === winner ? 'Landed on the moon' : kinds[index] === 'fizzle' ? `Ran out of fuel at ${km(p)} km` : `Exploded at ${km(p)} km` })),
    };
  },
  draw(ctx, t, b, names, waiting) {
    const k = b ? easeInOut(Math.max(0, Math.min(1, (t - 1.5) / Math.max(1, b.winnerEnd - 1.5)))) : 0;
    const cam = new Cam(lerp3([drift(t, 90), 80, 560], [drift(t, 40), 260, 300], k), lerp3([0, 290, -250], [0, 560, -560], k), 62);
    const sc = new Scene(ctx, cam);
    space(sc, t);
    const pad = (x: number, z: number) => { sc.cyl([x, 0, z], 18, 4, '#4A4070', { segs: 10, cap: '#5B5088' }); };
    if (!b) {
      for (let i = 0; i < Math.min(waiting, 12); i++) { const x = (i - (Math.min(waiting, 12) - 1) / 2) * 90, z = depthOf(i) * 0.5; pad(x, z); rocket3(sc, [x, 20, z], [0, 1, 0], colorFor(i), 0, 1, t); }
      sc.flush(); return;
    }
    const up: { r: Rocket; p: V }[] = [];
    for (const r of b.data.rockets) {
      const tau = t - r.launch;
      const base = padOf(r);
      pad(base[0], base[2]);
      const col = r.kind === 'land' && t >= b.winnerEnd ? GOLD : colorFor(r.index);
      if (tau < 0) { rocket3(sc, add(base, [0, 20, 0]), [0, 1, 0], col, 0, 1, t); continue; }
      if (tau < 1) sc.burst(add(base, [0, 4, 0]), tau, r.index + 5, ['#CFCBE6', '#9E98C0', '#FFFFFF'], 16, 60, 1, -10);
      const td = r.kind === 'land' ? TF : dieAt(r.f);
      if (tau <= td) {
        const p = add(pos3(r, tau), [0, 20, 0]), q = add(pos3(r, tau + 0.05), [0, 20, 0]);
        for (let k = 1; k <= 4; k++) { const tp = tau - k * 0.12; if (tp > 0) sc.sphere(add(pos3(r, tp), [0, 4, 0]), 4 + k * 2, '#B8B3D6', { alpha: 0.22 / k, shine: 0 }); }
        rocket3(sc, p, sub(q, p), col, 1, 1, t);
        up.push({ r, p });
        continue;
      }
      const e = tau - td, p = add(pos3(r, td), [0, 20, 0]);
      if (r.kind === 'land') { rocket3(sc, landAt(), norm(sub(landAt(), MOON3)), col, 0, 1, t); continue; }
      if (r.kind === 'boom') {
        if (e < 0.5) sc.sphere(p, 10 + e * 70, '#FFB020', { alpha: 1 - e / 0.5, shine: 1 });
        sc.burst(p, e, r.index * 3 + 11, ['#FFB020', '#FF5A36', '#FFF2B0', '#FFFFFF'], 34, 110, 1.1, 60);
        continue;
      }
      const y = p[1] - 300 * e * e;
      if (y > 10) rocket3(sc, [p[0] + e * 40, y, p[2]], [Math.sin(e * 3), Math.cos(e * 3), 0.2], col, 0, 1, t);
      else { const e2 = e - Math.sqrt((p[1] - 10) / 300); sc.burst([p[0] + e * 40, 6, p[2]], e2, r.index * 5 + 2, ['#FFB020', '#FF5A36'], 18, 70, 0.7, 80); }
    }
    up.sort((a2, c) => c.p[1] - a2.p[1]);
    for (const u of up.slice(0, 3)) sc.label(u.p, names[u.r.index] ?? '', false, -36);
    sc.burst(landAt(), t - b.winnerEnd, 9, [GOLD, '#FFFFFF', '#5AB4FF'], 60, 160, 1.3, 40);
    sc.flush();
  },
};
