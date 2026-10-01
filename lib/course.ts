// 2D side view of the Fore! courses with a moving camera. Used when a device
// can't run the 3D view. Framework-free so the live site and the demo share it.
// Everything on screen is a pure function of the round's shots and the clock.

import {
  LAYOUT, MAPS, MapDef, Shot, CourseView,
  posAt, surfaceAt, terrain, hazardLevel, mulberry32, shotEvents, lastLanding, obstacleFocus,
} from './game';

export type { CourseView, CoursePlayback } from './game';

const W = 1000, H = 480, HORIZON = 0.58;
const L = LAYOUT;
const { TEE_X, CUP } = L;
const FT_PER_UNIT = (L.YARDS * 3) / (CUP - TEE_X);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type Cam = { x: number; y: number; z: number };

export function createCourse(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let view: CourseView = { playback: null, teeCount: 0, map: 0 };
  const cam: Cam = { x: TEE_X + 600, y: 160, z: 0.5 };
  let raf = 0, last = performance.now(), alive = true;

  const resize = () => {
    const w = canvas.clientWidth || W;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * H) / W) * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const sx = (x: number) => (x - cam.x) * cam.z + W / 2;
  const sy = (y: number) => H * HORIZON - (y - cam.y) * cam.z;
  const wx = (px: number) => cam.x + (px - W / 2) / cam.z;

  // ---------- camera ----------
  function target(now: number, m: MapDef): Cam {
    const T = (x: number) => terrain(m, x);
    const pb = view.playback;
    if (!pb) {
      const t = reduce ? 0 : now / 1000;
      const k = (1 - Math.cos((t * 2 * Math.PI) / 44)) / 2;
      const x = TEE_X + 300 + k * (CUP - TEE_X - 420);
      return { x, y: Math.max(T(x), 0) + 110, z: 0.55 };
    }
    const el = (Date.now() - pb.startedAt) / 1000;
    const ws = pb.shots.find((s) => s.index === pb.winner)!;
    const wEl = el - ws.launch;
    if (wEl >= lastLanding(ws) - 0.35) {
      const p = posAt(m, ws, Math.min(wEl, ws.dur));
      const bx = p ? p.x : CUP;
      const z = clamp((W * 0.55) / (Math.abs(CUP - bx) + 140), 1.0, 2.6);
      return { x: (bx + CUP) / 2, y: T(CUP) + 30 + (p ? Math.max(0, p.y - T(p.x)) * 0.45 : 0), z };
    }
    const focus = el > 0.9 ? obstacleFocus(m, pb.shots, el) : null;
    if (focus) { const ox = L.OBST[focus.stage]; return { x: ox - 40, y: T(ox) + 70, z: 1.5 }; }
    const moving = pb.shots
      .map((s) => ({ s, p: posAt(m, s, el - s.launch) }))
      .filter((q) => q.p && !q.p.gone && !q.p.rest && el - q.s.launch < q.s.dur);
    if (el < 0.9 || moving.length === 0) return { x: TEE_X + 150, y: T(TEE_X) + 70, z: 1.35 };
    const xs = moving.map((q) => q.p!.x);
    const lead = Math.max(...xs);
    const tail = Math.max(Math.min(...xs), lead - 900);
    const cx = tail * 0.35 + lead * 0.65 + 60;
    const z = clamp((W * 0.8) / (lead - tail + 420), 0.4, 1.2);
    const maxY = Math.max(...moving.filter((q) => q.p!.x >= tail - 50).map((q) => q.p!.y));
    let cy = Math.max(T(cx), -40) + 90;
    const topRoom = (H * HORIZON) / z;
    if (maxY + 60 > cy + topRoom) cy = maxY + 60 - topRoom;
    return { x: cx, y: cy, z };
  }

  // ---------- scenery ----------
  function drawSky(now: number, m: MapDef) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, m.sky.top); g.addColorStop(0.75, m.sky.low);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = m.sky.sun; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(820 - cam.x * 0.02, 70, 34, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (m.id === 'magma') return;
    const drift = reduce ? 0 : (now / 1000) * 6;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 7; i++) {
      const x = ((((i * 520 + drift - cam.x * 0.08) % 3600) + 3600) % 3600) - 400, y = 50 + (i * 37) % 80, s = 0.7 + ((i * 13) % 7) / 10;
      if (x < -200 || x > W + 200) continue;
      ctx.beginPath();
      ctx.ellipse(x, y, 60 * s, 16 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 34 * s, y - 10 * s, 34 * s, 16 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParallax(m: MapDef) {
    const base = Math.min(sy(Math.max(terrain(m, cam.x), -40)), H * 0.66);
    const farCol = m.id === 'glacier' ? '#E9F1F8' : m.id === 'dune' ? '#D08A58' : m.id === 'magma' ? '#3A2A2E' : '#9CC3B4';
    const midCol = m.id === 'glacier' ? '#C7D7E6' : m.id === 'dune' ? '#B9784A' : m.id === 'magma' ? '#2A2224' : '#6FA57F';
    const far = cam.x * 0.12;
    ctx.fillStyle = farCol; ctx.beginPath(); ctx.moveTo(0, H);
    for (let px = 0; px <= W; px += 10) {
      const x = px + far;
      const peaks = m.id === 'glacier' ? Math.abs(((x / 90) % 2) - 1) * 70 : Math.sin(x / 170) * 38 + Math.sin(x / 67) * 14;
      ctx.lineTo(px, base - 95 - peaks);
    }
    ctx.lineTo(W, H); ctx.fill();
    const mid = cam.x * 0.35;
    ctx.fillStyle = midCol; ctx.beginPath(); ctx.moveTo(0, H);
    for (let px = 0; px <= W; px += 8) ctx.lineTo(px, base - 38 - Math.sin((px + mid) / 120) * 22 - Math.sin((px + mid) / 47) * 7);
    ctx.lineTo(W, H); ctx.fill();
  }

  function surfColor(m: MapDef, s: string, x: number) {
    const C = m.colors;
    switch (s) {
      case 'fairway': case 'pad': return Math.floor(x / 55) % 2 ? C.fairway : C.fairway2;
      case 'green': return C.green;
      case 'tee': return C.tee;
      case 'sand': return C.sand;
      case 'rock': case 'hazard': return C.rock;
      default: return C.rough;
    }
  }

  function drawGround(m: MapDef, now: number) {
    const step = 3;
    ctx.fillStyle = m.colors.bank; ctx.beginPath(); ctx.moveTo(0, H);
    for (let px = 0; px <= W + step; px += step) ctx.lineTo(px, sy(terrain(m, wx(px))));
    ctx.lineTo(W + step, H); ctx.closePath(); ctx.fill();
    const strip = Math.max(4, 9 * cam.z);
    for (let px = 0; px <= W; px += step) {
      const x = wx(px), s = surfaceAt(x), top = sy(terrain(m, x));
      if (s === 'rock' || s === 'hazard') {
        ctx.fillStyle = m.colors.rockDeep; ctx.fillRect(px, top, step + 0.5, Math.max(0, H - top));
        ctx.fillStyle = m.colors.rock; ctx.fillRect(px, top, step + 0.5, Math.max(6, 40 * cam.z));
      }
      ctx.fillStyle = surfColor(m, s, x);
      ctx.fillRect(px, top - 1, step + 0.5, s === 'rock' || s === 'hazard' ? 3 : strip);
    }
    // Hazard fills
    m.hazards.forEach((hz, i) => {
      if (hz.type === 'void') return;
      const [a, b] = L.PIT[i];
      const l = sx(a), r = sx(b);
      if (r < 0 || l > W) return;
      const top = sy(hazardLevel(m, i));
      ctx.fillStyle = m.fill[hz.type];
      ctx.globalAlpha = hz.type === 'water' ? 0.9 : 1;
      ctx.fillRect(l, top, r - l, H - top);
      ctx.globalAlpha = 1;
      ctx.fillStyle = hz.type === 'lava' ? 'rgba(255,220,90,0.7)' : 'rgba(255,255,255,0.3)';
      const t = reduce ? 0 : now / 700;
      for (let k = 0; k < 7; k++) {
        const x = l + ((k * 97 + t * 30) % Math.max(1, r - l - 40));
        ctx.fillRect(x, top + 4 + (k % 3) * 7 * cam.z, 26 * cam.z, 2);
      }
    });
    // Launch pads
    const pulse = reduce ? 1 : 0.7 + 0.3 * Math.sin(now / 180);
    for (const px of L.PADS) {
      const x = sx(px - 14), y = sy(terrain(m, px));
      if (x < -80 || x > W + 80) continue;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = m.colors.pad;
      ctx.fillRect(x - 28 * cam.z, y - 5 * cam.z, 56 * cam.z, 6 * cam.z);
      ctx.fillRect(x - 2 * cam.z, y - 70 * cam.z, 4 * cam.z, 64 * cam.z);
      ctx.beginPath(); ctx.arc(x, y - 74 * cam.z, 7 * cam.z, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function prop(m: MapDef, x: number, seed: number) {
    const bx = sx(x), by = sy(terrain(m, x));
    if (bx < -80 || bx > W + 80) return;
    const r = mulberry32(seed), z = cam.z, h = (90 + r() * 60) * z;
    if (m.props === 'trees') {
      ctx.fillStyle = '#6B4B32'; ctx.fillRect(bx - 3 * z, by - h * 0.5, 6 * z, h * 0.5);
      ctx.fillStyle = '#2F7445'; ctx.beginPath(); ctx.arc(bx, by - h + 28 * z, 30 * z, 0, Math.PI * 2); ctx.fill();
    } else if (m.props === 'pines') {
      ctx.fillStyle = '#2E5E45';
      ctx.beginPath(); ctx.moveTo(bx, by - h); ctx.lineTo(bx + 24 * z, by - 10 * z); ctx.lineTo(bx - 24 * z, by - 10 * z); ctx.fill();
      ctx.fillStyle = '#F2F7FB';
      ctx.beginPath(); ctx.moveTo(bx, by - h); ctx.lineTo(bx + 9 * z, by - h + 28 * z); ctx.lineTo(bx - 9 * z, by - h + 28 * z); ctx.fill();
    } else if (m.props === 'cactus') {
      ctx.fillStyle = '#4F8A4A';
      ctx.fillRect(bx - 5 * z, by - h * 0.8, 10 * z, h * 0.8);
      ctx.fillRect(bx + 5 * z, by - h * 0.5, 12 * z, 5 * z); ctx.fillRect(bx + 12 * z, by - h * 0.68, 5 * z, h * 0.22);
      ctx.fillRect(bx - 17 * z, by - h * 0.4, 12 * z, 5 * z); ctx.fillRect(bx - 17 * z, by - h * 0.55, 5 * z, h * 0.18);
    } else {
      ctx.strokeStyle = '#2A211C'; ctx.lineWidth = 4 * z; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - h * 0.8);
      ctx.moveTo(bx, by - h * 0.45); ctx.lineTo(bx + 22 * z, by - h * 0.75);
      ctx.moveTo(bx, by - h * 0.35); ctx.lineTo(bx - 20 * z, by - h * 0.6); ctx.stroke();
    }
  }

  function sign(m: MapDef, x: number, text: string, bg: string, fg: string) {
    const bx = sx(x), by = sy(terrain(m, x)), z = cam.z;
    if (bx < -120 || bx > W + 120) return;
    ctx.fillStyle = '#8B5E3C'; ctx.fillRect(bx - 2 * z, by - 34 * z, 4 * z, 34 * z);
    ctx.font = `700 ${Math.max(8, 11 * z)}px ui-monospace, monospace`;
    const w = ctx.measureText(text).width + 12 * z;
    ctx.fillStyle = bg; ctx.fillRect(bx - w / 2, by - 52 * z, w, 18 * z);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, bx, by - 43 * z); ctx.textBaseline = 'alphabetic';
  }

  function drawProps(m: MapDef, now: number) {
    for (const [x, s] of [[-300, 1], [-180, 2], [-60, 3], [640, 4], [1180, 5], [4620, 6], [4720, 7], [4880, 8], [5020, 9]]) prop(m, x, s);
    m.hazards.forEach((hz, i) => sign(m, L.PIT[i][0] - 60, hz.sign, '#8B5E3C', '#FFF7E6'));
    L.PADS.forEach((px, i) => sign(m, px - 120, `LAUNCH PAD ${i + 1}`, m.colors.pad, '#10251A'));
    for (const yds of [200, 100]) {
      const x = CUP - (yds * 3) / FT_PER_UNIT, bx = sx(x), by = sy(terrain(m, x));
      if (bx < -40 || bx > W + 40) continue;
      ctx.fillStyle = '#fff'; ctx.fillRect(bx - 1.5 * cam.z, by - 22 * cam.z, 3 * cam.z, 22 * cam.z);
      ctx.font = `700 ${Math.max(8, 10 * cam.z)}px ui-monospace, monospace`; ctx.textAlign = 'center';
      ctx.fillText(String(yds), bx, by - 26 * cam.z);
    }
    const cx = sx(CUP), cy = sy(terrain(m, CUP));
    if (cx > -80 && cx < W + 80) {
      ctx.fillStyle = '#1C2B20'; ctx.beginPath(); ctx.ellipse(cx, cy + 1, 9 * cam.z, 3 * cam.z, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#F4F4F0'; ctx.lineWidth = Math.max(1.5, 3 * cam.z);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 120 * cam.z); ctx.stroke();
      const wv = reduce ? 0 : Math.sin(now / 250) * 5 * cam.z;
      ctx.fillStyle = '#E0412B'; ctx.beginPath(); ctx.moveTo(cx + 1, cy - 120 * cam.z);
      ctx.quadraticCurveTo(cx + 24 * cam.z, cy - 114 * cam.z + wv, cx + 48 * cam.z, cy - 106 * cam.z + wv * 0.6);
      ctx.quadraticCurveTo(cx + 24 * cam.z, cy - 98 * cam.z + wv, cx + 1, cy - 92 * cam.z); ctx.fill();
    }
  }

  // ---------- fairway obstacles ----------
  type Hit = { a: number; fail: boolean };
  function drawObstacle(m: MapDef, i: number, now: number, hits: Hit[]) {
    const ox = L.OBST[i], bx = sx(ox), by = sy(terrain(m, ox)), z = cam.z;
    if (bx < -150 || bx > W + 150) return;
    const t = reduce ? 0 : now / 1000;
    const failing = (from: number, to: number) => hits.find((h) => h.fail && h.a >= from && h.a <= to);
    ctx.save();
    switch (m.obstacles[i].type) {
      case 'windmill': {
        ctx.fillStyle = '#F1E3C6'; ctx.fillRect(bx - 25 * z, by - 80 * z, 70 * z, 80 * z);
        ctx.fillStyle = '#1B1410'; ctx.fillRect(bx - 25 * z, by - 28 * z, 22 * z, 28 * z);
        ctx.fillStyle = '#C0392B'; ctx.beginPath(); ctx.moveTo(bx - 35 * z, by - 80 * z); ctx.lineTo(bx + 55 * z, by - 80 * z); ctx.lineTo(bx + 10 * z, by - 130 * z); ctx.fill();
        const hx = bx - 30 * z, hy = by - 74 * z, ang = t * 1.9 * (failing(0, 0.6) ? 3 : 1);
        ctx.strokeStyle = '#FFF8EC'; ctx.lineWidth = 8 * z;
        for (let k = 0; k < 4; k++) { const a = ang + (k * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * 90 * z, hy + Math.sin(a) * 90 * z); ctx.stroke(); }
        break;
      }
      case 'sprinkler': {
        ctx.fillStyle = '#666A70'; ctx.fillRect(bx - 5 * z, by - 22 * z, 10 * z, 22 * z);
        const len = Math.cos(t * 2.6) * 110 * z;
        ctx.strokeStyle = '#D9DDE2'; ctx.lineWidth = 6 * z; ctx.beginPath(); ctx.moveTo(bx - len, by - 24 * z); ctx.lineTo(bx + len, by - 24 * z); ctx.stroke();
        ctx.fillStyle = 'rgba(207,233,255,0.9)';
        for (let k = 0; k < 12; k++) { const p = (t * 1.1 + k / 12) % 1; ctx.fillRect(bx + len + p * 50 * z, by - (24 + 50 * p - 70 * p * p) * z, 3, 3); ctx.fillRect(bx - len - p * 50 * z, by - (24 + 50 * p - 70 * p * p) * z, 3, 3); }
        break;
      }
      case 'tumbleweeds': {
        ctx.strokeStyle = '#9A7A45'; ctx.lineWidth = 2;
        for (let k = 0; k < 2; k++) {
          const wx2 = bx + (k * 22 - 10) * z, wy = by - (20 + Math.abs(Math.sin(t * 4 + k)) * 14) * z, r = 20 * z;
          ctx.beginPath(); ctx.arc(wx2, wy, r, 0, Math.PI * 2); ctx.stroke();
          for (let j = 0; j < 5; j++) { const a = t * 3 + j * 1.3; ctx.beginPath(); ctx.moveTo(wx2 + Math.cos(a) * r, wy + Math.sin(a) * r); ctx.lineTo(wx2 - Math.cos(a + 0.8) * r, wy - Math.sin(a + 0.8) * r); ctx.stroke(); }
        }
        break;
      }
      case 'sandworm': {
        ctx.fillStyle = '#8A6A3A'; ctx.beginPath(); ctx.ellipse(bx, by, 36 * z, 7 * z, 0, 0, Math.PI * 2); ctx.fill();
        const eat = failing(-0.5, 1.6);
        const e = eat ? Math.max(0, Math.sin(Math.min(1, (eat.a + 0.5) / 2.1) * Math.PI)) : reduce ? 0 : Math.max(0, Math.sin(now / 1400)) ** 8 * 0.35;
        for (let k = 0; k < 7; k++) {
          ctx.fillStyle = k % 2 ? '#B07A5A' : '#C48A66';
          ctx.beginPath(); ctx.arc(bx - (12 - Math.sin(k * 0.5) * 12 * e + k * 3 * e) * z, by - (k * 17 * e - 10) * z, (22 - k * 1.8) * z, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#8A6A3A'; ctx.fillRect(bx - 40 * z, by, 80 * z, 30 * z);
        break;
      }
      case 'snowman': {
        const h = hits.find((q) => q.a >= 0 && q.a <= 0.8);
        ctx.translate(bx, by); ctx.rotate(h ? Math.sin(h.a * 28) * 0.18 * (1 - h.a / 0.8) : 0);
        ctx.fillStyle = '#FFFFFF';
        for (const [r, y] of [[30, 30], [22, 78], [16, 112]]) { ctx.beginPath(); ctx.arc(0, -y * z, r * z, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#1A1A1A'; ctx.fillRect(-11 * z, -143 * z, 22 * z, 18 * z); ctx.fillRect(-17 * z, -127 * z, 34 * z, 3 * z);
        ctx.fillStyle = '#FF8A2A'; ctx.beginPath(); ctx.moveTo(-14 * z, -116 * z); ctx.lineTo(-32 * z, -113 * z); ctx.lineTo(-14 * z, -110 * z); ctx.fill();
        break;
      }
      case 'icespikes': {
        ctx.fillStyle = 'rgba(191,232,255,0.95)';
        for (let k = 0; k < 5; k++) {
          const hgt = reduce ? 0.6 : 0.25 + 0.75 * Math.max(0, Math.sin(now / 650 + k * 0.8));
          const cx = bx + (k - 2) * 14 * z;
          ctx.beginPath(); ctx.moveTo(cx - 8 * z, by); ctx.lineTo(cx, by - 44 * hgt * z); ctx.lineTo(cx + 8 * z, by); ctx.fill();
        }
        if (hits.some((q) => q.fail && q.a > 0.2)) { ctx.fillStyle = 'rgba(191,232,255,0.7)'; ctx.fillRect(bx - 17 * z, by - 22 * z, 22 * z, 22 * z); }
        break;
      }
      case 'geyser': {
        ctx.fillStyle = '#2A2220'; ctx.fillRect(bx - 36 * z, by - 8 * z, 72 * z, 8 * z);
        const blast = failing(-0.15, 1.2);
        const k = blast ? 1 : (reduce ? 0 : Math.max(0, Math.sin(now / 900)) ** 6) * 0.55;
        ctx.fillStyle = k > 0.1 ? '#FFD23F' : '#FF6A2A'; ctx.fillRect(bx - 22 * z, by - 10 * z, 44 * z, 3 * z);
        if (k > 0.03) {
          const g = ctx.createLinearGradient(0, by, 0, by - (20 + k * 300) * z);
          g.addColorStop(0, 'rgba(255,210,63,0.95)'); g.addColorStop(1, 'rgba(255,90,31,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx - 20 * z, by - 8 * z); ctx.lineTo(bx + 20 * z, by - 8 * z); ctx.lineTo(bx, by - (20 + k * 300) * z); ctx.fill();
        }
        break;
      }
      case 'boulder': {
        const rot = reduce ? 0 : t * 2;
        ctx.translate(bx, by - 34 * z); ctx.rotate(rot);
        ctx.fillStyle = '#4A4440'; ctx.beginPath();
        for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; const r = (30 + (k % 2) * 6) * z; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.fill();
        break;
      }
    }
    ctx.restore();
    sign(m, ox - 70, m.obstacles[i].sign, '#8B5E3C', '#FFF7E6');
  }

  // ---------- balls & effects ----------
  function ball(m: MapDef, x: number, y: number, alpha: number, gold: boolean, label: string | null, mine = false) {
    const bx = sx(x), by = sy(y), gy = sy(terrain(m, x));
    if (bx < -40 || bx > W + 40) return;
    const r = clamp(5 * cam.z, 3, 9);
    const lift = Math.max(0, gy - by), sh = Math.max(0.2, 1 - lift / 300);
    if (gy - by > -10) {
      ctx.fillStyle = `rgba(0,0,0,${0.28 * sh * alpha})`;
      ctx.beginPath(); ctx.ellipse(bx, gy, r * 1.2 * sh + 1, r * 0.4 * sh + 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gold ? '#F2C230' : mine ? '#FF5A3C' : '#FFFFFF';
    ctx.beginPath(); ctx.arc(bx, by - r, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
    if (label && bx > 0 && bx < W) {
      ctx.font = '700 12px ui-monospace, monospace';
      const w = ctx.measureText(label).width + 10;
      const lx = clamp(bx - w / 2, 4, W - w - 4), ly = clamp(by - r * 2 - 22, 4, H - 40);
      ctx.fillStyle = gold ? 'rgba(242,194,48,.95)' : mine ? 'rgba(255,90,60,.95)' : 'rgba(14,36,25,.85)';
      ctx.beginPath(); ctx.roundRect(lx, ly, w, 17, 4); ctx.fill();
      ctx.fillStyle = gold ? '#10251A' : '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, lx + 5, ly + 12.5);
    }
  }

  function trail(m: MapDef, s: Shot, t: number) {
    ctx.lineCap = 'round';
    for (let k = 1; k <= 12; k++) {
      const a = posAt(m, s, t - k * 0.035), b = posAt(m, s, t - (k - 1) * 0.035);
      if (!a || !b || !a.air) break;
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - k / 12)})`;
      ctx.lineWidth = clamp(4 * cam.z, 1.5, 5) * (1 - k / 14);
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y) - 4); ctx.lineTo(sx(b.x), sy(b.y) - 4); ctx.stroke();
    }
  }

  function burst(x: number, y: number, a: number, seed: number, colors: string[], count: number, speed: number, gravity: number, life: number) {
    if (a < 0 || a > life || reduce) return;
    const r = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const ang = Math.PI * (0.1 + r() * 0.8), v = speed * (0.4 + r() * 0.8);
      const px = x + Math.cos(ang) * v * a * (r() < 0.5 ? -1 : 1);
      const py = y + Math.sin(ang) * v * a - 0.5 * gravity * a * a;
      ctx.globalAlpha = Math.max(0, 1 - a / life);
      ctx.fillStyle = colors[i % colors.length];
      const s = clamp(4 * cam.z, 2, 6);
      ctx.fillRect(sx(px) - s / 2, sy(py) - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  const FX: Record<string, string[]> = {
    water: ['#DDEEFF', '#FFFFFF', '#9CC8EE'], lava: ['#FFD23F', '#FF7A1F', '#FF3D00'],
    quicksand: ['#D8B878', '#B8914F', '#F2DFAE'], void: ['#BBBBBB', '#888888'],
  };

  function miniMap(m: MapDef, dots: { x: number; gold: boolean }[]) {
    const x0 = 20, x1 = W - 20, y = H - 14;
    const map = (x: number) => x0 + ((x - (TEE_X - 100)) / (5100 - (TEE_X - 100))) * (x1 - x0);
    ctx.fillStyle = 'rgba(14,36,25,.55)'; ctx.beginPath(); ctx.roundRect(x0 - 8, y - 9, x1 - x0 + 16, 18, 9); ctx.fill();
    m.hazards.forEach((hz, i) => { ctx.fillStyle = hz.type === 'void' ? '#111' : m.fill[hz.type]; ctx.fillRect(map(L.PIT[i][0]), y - 3, map(L.PIT[i][1]) - map(L.PIT[i][0]), 6); });
    ctx.fillStyle = m.colors.pad; for (const p of L.PADS) ctx.fillRect(map(p) - 2, y - 5, 4, 10);
    ctx.fillStyle = m.colors.green; ctx.fillRect(map(L.GREEN[0]), y - 3, map(L.GREEN[1]) - map(L.GREEN[0]), 6);
    const half = W / 2 / cam.z;
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1;
    ctx.strokeRect(map(cam.x - half), y - 7, map(cam.x + half) - map(cam.x - half), 14);
    ctx.fillStyle = '#E0412B'; ctx.fillRect(map(CUP) - 1, y - 8, 2, 12);
    for (const b of dots) { ctx.fillStyle = b.gold ? '#F2C230' : '#fff'; ctx.beginPath(); ctx.arc(map(b.x), y, 2.4, 0, Math.PI * 2); ctx.fill(); }
  }

  // ---------- frame ----------
  function frame(now: number) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const pb = view.playback;
    const m = MAPS[pb ? pb.map : view.map] ?? MAPS[0];
    const t = target(now, m);
    const kx = 1 - Math.exp(-dt * 3.2), kz = 1 - Math.exp(-dt * 2.4);
    cam.x += (t.x - cam.x) * kx; cam.y += (t.y - cam.y) * kx; cam.z += (t.z - cam.z) * kz;
    const half = W / 2 / cam.z;
    cam.x = clamp(cam.x, L.WORLD[0] + half, L.WORLD[1] - half);

    drawSky(now, m);
    drawParallax(m);
    drawGround(m, now);
    drawProps(m, now);
    const obHits: Hit[][] = [[], []];
    if (pb) {
      const el = (Date.now() - pb.startedAt) / 1000;
      for (const s of pb.shots) for (const h of s.hits) obHits[h.stage].push({ a: el - s.launch - h.t, fail: h.fail });
    }
    drawObstacle(m, 0, now, obHits[0]);
    drawObstacle(m, 1, now, obHits[1]);

    const dots: { x: number; gold: boolean }[] = [];
    const teeY = terrain(m, TEE_X) + L.BALL_R;
    if (!pb) {
      for (const s of view.resting ?? []) if (s.end === 'rest') { ball(m, s.xF, terrain(m, s.xF) + L.BALL_R, 0.45, false, null); dots.push({ x: s.xF, gold: false }); }
      for (let i = 0; i < Math.min(view.teeCount, 8); i++) ball(m, TEE_X - 14 - i * 12, teeY, 1, false, null);
      if (view.teeCount) dots.push({ x: TEE_X, gold: false });
    } else {
      const el = (Date.now() - pb.startedAt) / 1000;
      const waiting = pb.shots.filter((s) => el < s.launch).length;
      for (let i = 0; i < Math.min(waiting, 8); i++) ball(m, TEE_X - 14 - i * 12, teeY, 1, false, null);
      const ws = pb.shots.find((s) => s.index === pb.winner)!;
      const finale = el - ws.launch >= lastLanding(ws) - 0.35;
      const flying: { s: Shot; x: number; y: number }[] = [];
      for (const s of pb.shots) {
        const ts = el - s.launch;
        for (const e of shotEvents(m, s)) {
          const a = ts - e.t, seed = s.index * 131 + Math.round(e.t * 10);
          if (e.type === 'launch') burst(e.x, e.y + 4, a, seed, ['#D9C9A3', '#A8C98F'], 10, 60, 120, 0.6);
          else if (e.type === 'pad') burst(e.x, e.y + 4, a, seed, [m.colors.pad, '#FFFFFF'], 26, 150, 120, 0.8);
          else if (e.type === 'land') burst(e.x, e.y + 3, a, seed, [m.colors.fairway, m.colors.fringe], 8, 60, 300, 0.5);
          else if (e.hazard) burst(e.x, e.y, a, seed, FX[e.hazard], 30, 150, 380, 1.2);
        }
        const p = posAt(m, s, ts);
        if (!p || p.gone) continue;
        dots.push({ x: p.x, gold: p.sink !== undefined });
        const mine = s.index === view.you;
        if (p.sink !== undefined) { ball(m, p.x, p.y, 1 - p.sink, true, pb.players[s.index] ?? null); continue; }
        if (mine) { if (p.air) trail(m, s, ts); ball(m, p.x, p.y, p.fade ?? 1, false, `YOU · ${pb.players[s.index] ?? ''}`, true); continue; }
        if (p.air) { trail(m, s, ts); flying.push({ s, x: p.x, y: p.y }); }
        else ball(m, p.x, p.y, p.fade ?? (p.rest ? 0.85 : 1), false, finale && s.index === pb.winner ? pb.players[s.index] ?? null : null);
      }
      const tagged = finale ? [] : flying.slice(-3);
      for (const f of flying) ball(m, f.x, f.y, 1, false, tagged.includes(f) ? pb.players[f.s.index] ?? null : null);
      const ca = el - (ws.launch + ws.dur);
      if (ca >= 0 && ca < 4 && !reduce) {
        const r = mulberry32(99), cols = ['#F2C230', '#E0412B', '#FFFFFF', '#8ED77F', '#7FC8F8'];
        for (let i = 0; i < 90; i++) {
          const vx = (r() - 0.5) * 360, vy = 180 + r() * 260, spin = r() * 10;
          const x = CUP + vx * ca, y = terrain(m, CUP) + vy * ca - 0.5 * 260 * ca * ca;
          if (y < terrain(m, x) - 2) continue;
          ctx.save(); ctx.translate(sx(x), sy(y)); ctx.rotate(spin * ca);
          ctx.fillStyle = cols[i % cols.length];
          const sz = clamp(5 * cam.z, 3, 9); ctx.fillRect(-sz / 2, -sz / 3, sz, sz * 0.66);
          ctx.restore();
        }
      }
    }
    miniMap(m, dots);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    update(v: CourseView) { view = v; },
    destroy() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); },
  };
}
