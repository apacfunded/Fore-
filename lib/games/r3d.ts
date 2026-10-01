// A tiny 3D renderer for the arcade, drawn on a normal 2D canvas.
// Perspective camera, one sun light, painter's-algorithm depth sorting, shaded spheres and soft shadows.
// No packages needed. World units are arbitrary; Y is up.
import { Ctx, W, H, TAU, clamp, mulberry32, tag } from './util';

export type V = [number, number, number];
export const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V): V => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a: V, b: V, p: number): V => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];

export const LIGHT = norm([-0.45, 0.85, 0.5]);
const NEAR = 4;

export type P = { x: number; y: number; z: number; s: number };

export class Cam {
  pos: V = [0, 0, 0]; f: V = [0, 0, -1]; r: V = [1, 0, 0]; u: V = [0, 1, 0]; foc = 500;
  constructor(pos: V, tgt: V, fov = 50) { this.set(pos, tgt, fov); }
  set(pos: V, tgt: V, fov = 50) {
    this.pos = pos;
    this.f = norm(sub(tgt, pos));
    this.r = norm(cross(this.f, [0, 1, 0]));
    this.u = cross(this.r, this.f);
    this.foc = (H / 2) / Math.tan((fov * Math.PI) / 360);
    return this;
  }
  view(p: V): V { const d = sub(p, this.pos); return [dot(d, this.r), dot(d, this.u), dot(d, this.f)]; }
  proj(c: V): P { const s = this.foc / c[2]; return { x: W / 2 + c[0] * s, y: H / 2 - c[1] * s, z: c[2], s }; }
  p(pt: V): P | null { const c = this.view(pt); return c[2] < NEAR ? null : this.proj(c); }
}

type RGB = [number, number, number];
const cache = new Map<string, RGB>();
export function rgb(hex: string): RGB {
  let c = cache.get(hex);
  if (!c) { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; cache.set(hex, c); }
  return c;
}
export function css(hex: string, k = 1, a = 1) {
  const [r, g, b] = rgb(hex);
  const f = (v: number) => Math.round(clamp(k > 1 ? v + (255 - v) * (k - 1) : v * k, 0, 255));
  return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
}

type Item = { layer: number; z: number; i: number; draw: () => void };
export type PolyOpts = { layer?: number; cull?: boolean; light?: boolean; alpha?: number; stroke?: string; lw?: number; bias?: number; amb?: number };

export class Scene {
  items: Item[] = [];
  n = 0;
  constructor(public ctx: Ctx, public cam: Cam) {}
  private push(layer: number, z: number, draw: () => void) { this.items.push({ layer, z, i: this.n++, draw }); }
  custom(layer: number, z: number, draw: () => void) { this.push(layer, z, draw); }

  /** Flat polygon, clipped to the near plane and lit by its normal. */
  poly(pts: V[], color: string, o: PolyOpts = {}) {
    if (pts.length < 3) return;
    const cam = this.cam;
    const nrm = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const toCam = sub(cam.pos, pts[0]);
    const facing = dot(nrm, toCam);
    if (o.cull && facing < 0) return;
    let vs = pts.map((p) => cam.view(p));
    if (vs.some((v) => v[2] < NEAR)) {
      const out: V[] = [];
      for (let k = 0; k < vs.length; k++) {
        const a = vs[k], b = vs[(k + 1) % vs.length];
        const ain = a[2] >= NEAR, bin = b[2] >= NEAR;
        if (ain) out.push(a);
        if (ain !== bin) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
      }
      vs = out;
      if (vs.length < 3) return;
    }
    const ps = vs.map((v) => cam.proj(v));
    const z = vs.reduce((s, v) => s + v[2], 0) / vs.length + (o.bias ?? 0);
    const n2 = facing < 0 ? mul(nrm, -1) : nrm;
    const k = o.light === false ? 1 : (o.amb ?? 0.5) + 0.62 * Math.max(0, dot(n2, LIGHT));
    const fill = css(color, k, o.alpha ?? 1);
    this.push(o.layer ?? 2, z, () => {
      const c = this.ctx;
      c.beginPath(); c.moveTo(ps[0].x, ps[0].y);
      for (let i = 1; i < ps.length; i++) c.lineTo(ps[i].x, ps[i].y);
      c.closePath(); c.fillStyle = fill; c.fill();
      if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.lw ?? 1; c.stroke(); }
      else { c.strokeStyle = fill; c.lineWidth = 0.6; c.stroke(); } // hides seams between faces
    });
  }

  /** Shaded sphere with a specular highlight. */
  sphere(c: V, r: number, color: string, o: { alpha?: number; layer?: number; shine?: number; bias?: number } = {}) {
    const p = this.cam.p(c);
    if (!p) return;
    const rad = r * p.s;
    if (rad < 0.25) return;
    const a = o.alpha ?? 1;
    const lx = dot(LIGHT, this.cam.r), ly = dot(LIGHT, this.cam.u);
    this.push(o.layer ?? 2, p.z + (o.bias ?? 0), () => {
      const g = this.ctx;
      if (rad < 1.6) { g.fillStyle = css(color, 1, a); g.fillRect(p.x - rad, p.y - rad, rad * 2, rad * 2); return; }
      const hx = p.x + lx * rad * 0.42, hy = p.y - ly * rad * 0.42;
      const gr = g.createRadialGradient(hx, hy, rad * 0.05, p.x, p.y, rad);
      gr.addColorStop(0, css(color, 1 + (o.shine ?? 0.55), a));
      gr.addColorStop(0.45, css(color, 1, a));
      gr.addColorStop(1, css(color, 0.42, a));
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, rad, 0, TAU); g.fill();
    });
  }

  /** Circle lying in a plane (normal n). Good for discs, holes, rings, coins. */
  disc(c: V, r: number, n: V, color: string, o: PolyOpts & { segs?: number } = {}) {
    const nn = norm(n);
    const a = norm(Math.abs(nn[1]) > 0.9 ? cross(nn, [1, 0, 0]) : cross(nn, [0, 1, 0]));
    const b = cross(nn, a);
    const segs = o.segs ?? 28;
    const pts: V[] = [];
    for (let i = 0; i < segs; i++) { const t = (i / segs) * TAU; pts.push(add(c, add(mul(a, Math.cos(t) * r), mul(b, Math.sin(t) * r)))); }
    this.poly(pts, color, o);
  }

  /** Vertical cylinder from base upward. */
  cyl(base: V, r: number, h: number, color: string, o: PolyOpts & { segs?: number; cap?: string } = {}) {
    const segs = o.segs ?? 14;
    const ring = (y: number) => Array.from({ length: segs }, (_, i) => { const t = (i / segs) * TAU; return [base[0] + Math.cos(t) * r, base[1] + y, base[2] + Math.sin(t) * r] as V; });
    const lo = ring(0), hi = ring(h);
    for (let i = 0; i < segs; i++) { const j = (i + 1) % segs; this.poly([lo[j], lo[i], hi[i], hi[j]], color, { ...o, cull: true }); }
    this.poly([...hi].reverse(), o.cap ?? color, { ...o, cull: true });
  }

  /** Axis-aligned box centred on c. */
  box(c: V, sx: number, sy: number, sz: number, color: string, o: PolyOpts & { top?: string } = {}) {
    const [x, y, z] = c, a = sx / 2, b = sy / 2, d = sz / 2;
    const P = (i: number, j: number, k: number): V => [x + i * a, y + j * b, z + k * d];
    const q = { ...o, cull: true };
    this.poly([P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], color, q);
    this.poly([P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)], color, q);
    this.poly([P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)], o.top ?? color, q);
    this.poly([P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], color, q);
    this.poly([P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1)], color, q);
    this.poly([P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)], color, q);
  }

  /** A box rotated about the Y axis (and optionally tilted about its own X). */
  obox(c: V, sx: number, sy: number, sz: number, yaw: number, color: string, o: PolyOpts & { roll?: number; top?: string } = {}) {
    const cy = Math.cos(yaw), sy2 = Math.sin(yaw), cr = Math.cos(o.roll ?? 0), sr = Math.sin(o.roll ?? 0);
    const T = (i: number, j: number, k: number): V => {
      let px = i * sx / 2, py = j * sy / 2, pz = k * sz / 2;
      const rx = px * cr - py * sr, ry = px * sr + py * cr; px = rx; py = ry; // roll about Z
      return [c[0] + px * cy + pz * sy2, c[1] + py, c[2] - px * sy2 + pz * cy];
    };
    const q = { ...o, cull: true };
    const F = (a: V, b: V, cc: V, d: V, col = color) => this.poly([a, b, cc, d], col, q);
    F(T(-1, -1, 1), T(1, -1, 1), T(1, 1, 1), T(-1, 1, 1));
    F(T(1, -1, -1), T(-1, -1, -1), T(-1, 1, -1), T(1, 1, -1));
    F(T(-1, 1, 1), T(1, 1, 1), T(1, 1, -1), T(-1, 1, -1), o.top ?? color);
    F(T(-1, -1, -1), T(1, -1, -1), T(1, -1, 1), T(-1, -1, 1));
    F(T(1, -1, 1), T(1, -1, -1), T(1, 1, -1), T(1, 1, 1));
    F(T(-1, -1, -1), T(-1, -1, 1), T(-1, 1, 1), T(-1, 1, -1));
  }

  /** Cylinder between two points (any direction). r2 lets it taper; r2 = 0 makes a cone. */
  tube(a: V, b: V, r: number, color: string, o: PolyOpts & { segs?: number; r2?: number; cap?: boolean } = {}) {
    const ax = norm(sub(b, a));
    const p1 = norm(Math.abs(ax[1]) > 0.9 ? cross(ax, [1, 0, 0]) : cross(ax, [0, 1, 0]));
    const p2 = cross(ax, p1);
    const segs = o.segs ?? 10, r2 = o.r2 ?? r;
    const ring = (c: V, rr: number) => Array.from({ length: segs }, (_, i) => { const t = (i / segs) * TAU; return add(c, add(mul(p1, Math.cos(t) * rr), mul(p2, Math.sin(t) * rr))); });
    const lo = ring(a, r), hi = ring(b, r2);
    const q = { ...o, cull: true };
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      if (r2 > 0.01) this.poly([lo[i], lo[j], hi[j], hi[i]], color, q);
      else this.poly([lo[i], lo[j], b], color, q);
    }
    if (o.cap !== false) { this.poly([...lo].reverse(), color, q); if (r2 > 0.01) this.poly(hi, color, q); }
  }

  line(a: V, b: V, color: string, w = 1, o: { layer?: number; alpha?: number; bias?: number } = {}) {
    const pa = this.cam.p(a), pb = this.cam.p(b);
    if (!pa || !pb) return;
    const lw = Math.min(w * 3.5, Math.max(0.5, w * (pa.s + pb.s) / 2));
    this.push(o.layer ?? 2, (pa.z + pb.z) / 2 + (o.bias ?? 0), () => {
      const g = this.ctx; g.strokeStyle = css(color, 1, o.alpha ?? 1); g.lineWidth = lw; g.lineCap = 'round';
      g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
    });
  }

  /** Soft contact shadow on a horizontal surface at height y. */
  shadow(c: V, r: number, alpha = 0.3, layer = 1) {
    const pts: V[] = [];
    for (let i = 0; i < 18; i++) { const t = (i / 18) * TAU; pts.push([c[0] + Math.cos(t) * r, c[1], c[2] + Math.sin(t) * r * 0.9]); }
    const ps = pts.map((p) => this.cam.p(p));
    if (ps.some((p) => !p)) return;
    const cp = this.cam.p(c)!;
    this.push(layer, cp.z, () => {
      const g = this.ctx;
      g.fillStyle = `rgba(0,0,0,${alpha})`;
      g.beginPath(); ps.forEach((p, i) => (i ? g.lineTo(p!.x, p!.y) : g.moveTo(p!.x, p!.y))); g.closePath(); g.fill();
    });
  }

  /** Plain text at a world point, sized with distance. */
  text(pt: V, str: string, color: string, size = 14, layer = 9) {
    const p = this.cam.p(pt);
    if (!p) return;
    const px = Math.max(8, Math.min(40, size * p.s));
    this.push(layer, layer === 2 ? p.z : -p.z, () => { const g = this.ctx; g.font = `700 ${px}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(str, p.x, p.y); g.textBaseline = 'alphabetic'; });
  }

  label(pt: V, text: string, gold = false, dy = -30) {
    const p = this.cam.p(pt);
    if (!p) return;
    this.push(9, -p.z, () => tag(this.ctx, text, p.x, p.y + dy, gold));
  }

  /** Particle burst in world space, age seconds after it starts. */
  burst(c: V, age: number, salt: number, colors: string[], count = 30, speed = 120, life = 1, grav = 160) {
    if (age < 0 || age > life) return;
    const f = mulberry32(salt >>> 0);
    const a = 1 - age / life;
    for (let i = 0; i < count; i++) {
      const d = norm([f() - 0.5, f() - 0.3, f() - 0.5]);
      const s = speed * (0.35 + f() * 0.65);
      const p: V = [c[0] + d[0] * s * age, c[1] + d[1] * s * age - 0.5 * grav * age * age, c[2] + d[2] * s * age];
      const pp = this.cam.p(p);
      if (!pp) continue;
      const col = colors[i % colors.length], sz = Math.max(1.2, (2 + f() * 3) * pp.s * 0.6);
      this.push(3, pp.z, () => { const g = this.ctx; g.fillStyle = css(col, 1, a); g.fillRect(pp.x - sz / 2, pp.y - sz / 2, sz, sz); });
    }
  }

  flush() {
    this.items.sort((a, b) => a.layer - b.layer || (a.layer === 2 || a.layer === 3 ? b.z - a.z : 0) || a.i - b.i);
    for (const it of this.items) it.draw();
    this.items = []; this.n = 0;
  }
}

/** Vertical gradient backdrop. */
export function sky(ctx: Ctx, top: string, bottom: string, stop = 1) {
  const g = ctx.createLinearGradient(0, 0, 0, H * stop);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/** A slow, deterministic camera drift so scenes feel alive. */
export const drift = (t: number, amt: number, speed = 0.18) => Math.sin(t * speed) * amt;
