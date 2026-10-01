// 3D version of the Fore! courses, drawn with three.js (pinned to 0.128 so the
// live site and the standalone demo render identically). The THREE namespace is
// passed in, so the same file works with an npm import or a <script> global.
// Every frame is a pure function of the round's shots and the clock, so all
// viewers see the same shots at the same moment.

import {
  LAYOUT, MAPS, MapDef, Shot, CourseView, HazardType,
  posAt, surfaceAt, terrain, hazardLevel, mulberry32, shotEvents, lastLanding, obstacleFocus,
} from './game';
import { buildObstacle3D, ObstacleAnim, ObstacleHit } from './obstacles3d';

/* eslint-disable @typescript-eslint/no-explicit-any */
type T3 = any;

const L = LAYOUT;
const { TEE_X, CUP } = L;
const FT_PER_UNIT = (L.YARDS * 3) / (CUP - TEE_X);
const BALL_R = 7;
const X0 = -700, X1 = 5400, ZW = 3600;
const hex = (c: string) => parseInt(c.slice(1), 16);

// Ground anywhere: the hole's profile down the middle, rising banks at the sides.
export function ground(m: MapDef, x: number, z: number): number {
  const a = Math.abs(z);
  // Banks rise into valley walls, so the course sits in its own landscape all the way to the horizon.
  const bank = a < 210 ? 0 : Math.min(480, Math.pow((a - 210) / 360, 2) * 140);
  const bumps = a < 210 ? 0 : 6 * Math.sin(x / 83 + z / 57) + 4 * Math.sin(x / 41 - z / 97);
  return terrain(m, x) + bank + bumps;
}

function surface3(m: MapDef, x: number, z: number): string {
  const s = surfaceAt(x);
  const a = Math.abs(z);
  // Pit walls are rock near the fairway; further out the valley sides stay grassy.
  if (s === 'hazard') {
    const i = L.PIT.findIndex(([p, q]) => x > p && x < q);
    if (a < 300) return i >= 0 && m.hazards[i].type === 'void' ? 'void' : 'rockDeep';
    return a < 420 ? 'rock' : 'bank';
  }
  if (s === 'rock') return a < 330 ? 'rock' : 'bank';
  if (s === 'pad') return a < 150 ? 'fairway' : 'rough';
  const g = ((x - CUP) / 190) ** 2 + (z / 128) ** 2;
  if (g < 1) return 'green';
  if (g < 1.25) return 'fringe';
  const b = ((x - (L.BUNKER[0] + L.BUNKER[1]) / 2) / 48) ** 2 + (z / 70) ** 2;
  if (b < 1) return 'sand';
  if (s === 'tee') return a < 70 ? 'tee' : 'rough';
  if (s === 'fairway' || s === 'green' || s === 'sand') return a < 118 ? 'fairway' : a < 210 ? 'rough' : 'bank';
  return a < 210 ? 'rough' : 'bank';
}

function textTexture(THREE: T3, text: string, opts: { bg: string; fg: string; font: string; pad: number; h: number }) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = opts.font;
  const w = Math.ceil(g.measureText(text).width + opts.pad * 2);
  c.width = w; c.height = opts.h;
  g.font = opts.font;
  g.fillStyle = opts.bg;
  const r = Math.min(10, opts.h / 2);
  g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, opts.h, r); g.arcTo(w, opts.h, 0, opts.h, r); g.arcTo(0, opts.h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.fill();
  g.fillStyle = opts.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, opts.h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return { tex, aspect: w / opts.h };
}

// Fine speckle multiplied over the ground colours so grass, sand and snow read as surfaces, not flat paint.
function detailTexture(THREE: T3) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 256, 256);
  const r = mulberry32(77);
  for (let i = 0; i < 9000; i++) {
    const v = 175 + Math.floor(r() * 80);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 2 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// A golf ball: white with dimples and a red stripe so you can see it spin.
function ballTexture(THREE: T3, base: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(0,0,0,0.10)';
  for (let y = 6; y < 128; y += 11) for (let x = (y / 11) % 2 ? 6 : 0; x < 256; x += 12) { g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#E0412B'; g.fillRect(0, 58, 256, 12);
  const t = new THREE.CanvasTexture(c);
  return t;
}

type World = { group: T3; padMats: T3[]; lavaMats: T3[]; flagGeo: T3; flagBase: Float32Array; m: MapDef; anims: ObstacleAnim[] };

export function createCourse3D(canvas: HTMLCanvasElement, THREE: T3) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 1500, 5600);
  const camera = new THREE.PerspectiveCamera(46, 1000 / 480, 2, 20000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.75);
  // The sun casts real shadows; its shadow box follows the camera so it stays sharp along the long hole.
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -750, right: 750, top: 750, bottom: -750, near: 10, far: 4000 });
  sun.shadow.bias = -0.0006;
  const SUN_OFFSET = new THREE.Vector3(-700, 1300, -900);
  scene.add(hemi, sun, sun.target);

  // Sky dome: a gradient from the zenith down to the horizon haze, with a soft glow around the sun.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, sunDir: { value: SUN_OFFSET.clone().normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunCol; uniform vec3 sunDir; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y * 1.6 + 0.05, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.7));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += sunCol * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(15000, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  const detail = detailTexture(THREE);
  const waterBump = detailTexture(THREE);
  waterBump.repeat.set(6, 30);

  const sprite = (group: T3, text: string, x: number, y: number, z: number, height: number, bg: string, fg: string) => {
    const { tex, aspect } = textTexture(THREE, text, { bg, fg, font: '700 44px ui-monospace, Menlo, monospace', pad: 22, h: 72 });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
    sp.scale.set(height * aspect, height, 1);
    sp.position.set(x, y, z);
    group.add(sp);
  };

  // ---------- one world per map, built the first time it's needed ----------
  const worlds = new Map<number, World>();
  function buildWorld(mi: number): World {
    const m = MAPS[mi];
    const group = new THREE.Group();
    const rs = mulberry32(1000 + mi * 7919);
    const C = m.colors;
    const colorOf: Record<string, number> = {
      tee: hex(C.tee), fairway: hex(C.fairway), fairway2: hex(C.fairway2), green: hex(C.green), fringe: hex(C.fringe),
      rough: hex(C.rough), bank: hex(C.bank), sand: hex(C.sand), rock: hex(C.rock), rockDeep: hex(C.rockDeep), void: 0x0b0f14,
    };

    // Ground
    const geo = new THREE.PlaneGeometry(X1 - X0, ZW, 610, 140);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (X0 + X1) / 2, z = pos.getZ(i);
      pos.setX(i, x);
      pos.setY(i, ground(m, x, z));
      const s = surface3(m, x, z);
      col.setHex(s === 'fairway' && Math.floor(x / 60) % 2 ? colorOf.fairway2 : colorOf[s]);
      const shade = 0.93 + 0.07 * Math.sin(x * 0.37 + z * 0.61);
      colors[i * 3] = col.r * shade; colors[i * 3 + 1] = col.g * shade; colors[i * 3 + 2] = col.b * shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const groundTex = detail.clone(); groundTex.needsUpdate = true;
    groundTex.repeat.set((X1 - X0) / 45, ZW / 45);
    const groundMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex }));
    groundMesh.receiveShadow = true;
    groundMesh.userData.noCast = true;
    group.add(groundMesh);

    // Hazard fills
    const lavaMats: T3[] = [];
    m.hazards.forEach((hz, i) => {
      if (hz.type === 'void') return;
      const [a, b] = L.PIT[i];
      const mat = hz.type === 'lava'
        ? new THREE.MeshBasicMaterial({ color: hex(m.fill.lava), map: detail })
        : hz.type === 'water'
          ? new THREE.MeshPhongMaterial({ color: hex(m.fill.water), transparent: true, opacity: 0.86, shininess: 90, specular: 0x9fc4e0, bumpMap: waterBump, bumpScale: 0.6 })
          : new THREE.MeshLambertMaterial({ color: hex(m.fill[hz.type]), map: detail });
      if (hz.type === 'lava') lavaMats.push(mat);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(b - a + 40, ZW, 1, 1), mat);
      plane.userData.noCast = true; plane.receiveShadow = hz.type !== 'lava';
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((a + b) / 2, hazardLevel(m, i), 0);
      group.add(plane);
      if (hz.type === 'lava') {
        const glow = new THREE.PointLight(0xff6a2a, 1.4, 900);
        glow.position.set((a + b) / 2, hazardLevel(m, i) + 80, 0);
        group.add(glow);
      }
    });

    // Launch pads: a glowing strip across the fairway with chevrons
    const padMats: T3[] = [];
    for (const px of L.PADS) {
      const gy = terrain(m, px);
      const padMat = new THREE.MeshBasicMaterial({ color: hex(C.pad) });
      padMats.push(padMat);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(56, 3, 250), padMat);
      pad.position.set(px - 14, gy + 1, 0); group.add(pad);
      const chev = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (let k = -2; k <= 2; k++) {
        for (const side of [-1, 1]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(26, 3.5, 5), chev);
          bar.position.set(px - 14 + side * 0, gy + 2.6, k * 44 + side * 8);
          bar.rotation.y = side * 0.6;
          group.add(bar);
        }
      }
      const post = new THREE.MeshLambertMaterial({ color: 0x333333 });
      for (const z of [-140, 140]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 60, 8), post);
        p.position.set(px - 14, ground(m, px, z) + 30, z); group.add(p);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), padMat);
        orb.position.set(px - 14, ground(m, px, z) + 64, z); group.add(orb);
      }
    }

    // Props
    const addInstanced = (geo: T3, color: number, list: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; rz?: number }[]) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      const base = new THREE.Color(color), c = new THREE.Color();
      list.forEach((p, i) => {
        q.setFromEuler(e.set(0, p.ry ?? 0, p.rz ?? 0)); m4.compose(v.set(p.x, p.y, p.z), q, sc.set(p.sx, p.sy, p.sz)); mesh.setMatrixAt(i, m4);
        const k = 0.82 + rs() * 0.32; mesh.setColorAt(i, c.copy(base).multiplyScalar(k)); // natural variation
      });
      mesh.castShadow = true;
      group.add(mesh);
    };
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 7); cyl.translate(0, 0.5, 0);
    const cone = new THREE.ConeGeometry(1, 1, 8); cone.translate(0, 0.5, 0);
    const ball = new THREE.IcosahedronGeometry(1, 1);
    const rock = new THREE.DodecahedronGeometry(1, 0);
    const spots: { x: number; z: number; g: number }[] = [];
    for (let i = 0; i < 900; i++) {
      const x = X0 + 100 + rs() * (X1 - X0 - 200);
      if (L.PIT.some(([a, b]) => x > a - 60 && x < b + 60)) continue;
      if (x > L.GREEN[0] - 40 && x < L.GREEN[1] + 40 && rs() < 0.6) continue;
      const z = (rs() < 0.5 ? -1 : 1) * (330 + Math.pow(rs(), 0.8) * 1250);
      spots.push({ x, z, g: ground(m, x, z) });
    }
    const trunks: any[] = [], crowns: any[] = [], extra: any[] = [], extra2: any[] = [], rocks: any[] = [];
    for (const s of spots) {
      const h = 90 + rs() * 80, r = 24 + rs() * 16;
      if (m.props === 'trees') {
        trunks.push({ x: s.x, y: s.g, z: s.z, sx: 4, sy: h * 0.55, sz: 4 });
        crowns.push({ x: s.x, y: s.g + h - r * 0.9, z: s.z, sx: r, sy: r * 1.15, sz: r, ry: rs() * 6 });
        extra.push({ x: s.x + r * 0.45, y: s.g + h - r * 1.5, z: s.z - r * 0.2, sx: r * 0.7, sy: r * 0.75, sz: r * 0.7, ry: rs() * 6 });
      } else if (m.props === 'pines') {
        trunks.push({ x: s.x, y: s.g, z: s.z, sx: 4, sy: h * 0.3, sz: 4 });
        crowns.push({ x: s.x, y: s.g + h * 0.2, z: s.z, sx: r * 1.1, sy: h * 0.65, sz: r * 1.1 });
        extra.push({ x: s.x, y: s.g + h * 0.6, z: s.z, sx: r * 0.7, sy: h * 0.42, sz: r * 0.7 });
      } else if (m.props === 'cactus') {
        if (rs() < 0.4) { rocks.push({ x: s.x, y: s.g + 8, z: s.z, sx: 18 + rs() * 30, sy: 12 + rs() * 20, sz: 18 + rs() * 26, ry: rs() * 3 }); continue; }
        const ch = 60 + rs() * 60;
        trunks.push({ x: s.x, y: s.g, z: s.z, sx: 8, sy: ch, sz: 8 });
        extra.push({ x: s.x + 14, y: s.g + ch * 0.45, z: s.z, sx: 5, sy: ch * 0.35, sz: 5 });
        extra.push({ x: s.x - 13, y: s.g + ch * 0.3, z: s.z, sx: 5, sy: ch * 0.3, sz: 5 });
        extra2.push({ x: s.x, y: s.g + ch * 0.47, z: s.z, sx: 14, sy: 4, sz: 4 });
        extra2.push({ x: s.x - 6, y: s.g + ch * 0.32, z: s.z, sx: 12, sy: 4, sz: 4 });
      } else {
        if (rs() < 0.5) { rocks.push({ x: s.x, y: s.g + 6, z: s.z, sx: 16 + rs() * 30, sy: 14 + rs() * 26, sz: 16 + rs() * 26, ry: rs() * 3 }); continue; }
        trunks.push({ x: s.x, y: s.g, z: s.z, sx: 4, sy: h * 0.7, sz: 4 });
        extra.push({ x: s.x, y: s.g + h * 0.45, z: s.z, sx: 2.5, sy: h * 0.35, sz: 2.5, rz: 0.8 });
        extra.push({ x: s.x, y: s.g + h * 0.35, z: s.z, sx: 2.5, sy: h * 0.3, sz: 2.5, rz: -0.9 });
      }
    }
    if (m.props === 'trees') { addInstanced(cyl, 0x6b4b32, trunks); addInstanced(ball, 0x2f7445, crowns); addInstanced(ball, 0x3d8a4f, extra); }
    if (m.props === 'pines') { addInstanced(cyl, 0x5a4030, trunks); addInstanced(cone, 0x2e5e45, crowns); addInstanced(cone, 0xf2f7fb, extra); }
    if (m.props === 'cactus') { addInstanced(cyl, 0x4f8a4a, trunks); addInstanced(cyl, 0x4f8a4a, extra); addInstanced(cyl, 0x4f8a4a, extra2.map((e) => ({ ...e, rz: Math.PI / 2 }))); addInstanced(rock, 0xa0643c, rocks); }
    if (m.props === 'deadtrees') { addInstanced(cyl, 0x2a211c, trunks); addInstanced(cyl, 0x2a211c, extra); addInstanced(rock, 0x2b2522, rocks); }

    // Backdrop: mountains, mesas or hills standing beyond the valley walls
    const back = new THREE.MeshLambertMaterial({ color: m.id === 'glacier' ? 0xe9f1f8 : m.id === 'dune' ? 0xc07a4a : m.id === 'magma' ? 0x2a2224 : 0x7fae8a, flatShading: true });
    const rim = (x: number) => terrain(m, Math.max(-500, Math.min(5200, x))) + 420;
    for (let i = 0; i < 34; i++) {
      const side = i % 2 ? 1 : -1;
      const x = -1400 + (i / 2 | 0) * 460 + rs() * 220, z = side * (2100 + rs() * 1100);
      if (m.id === 'glacier') {
        const peak = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 7), back);
        const h = 900 + rs() * 1100;
        peak.scale.set(520 + rs() * 420, h, 520 + rs() * 420); peak.position.set(x, rim(x) - 200 + h / 2, z); group.add(peak);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
        cap.scale.set(peak.scale.x * 0.36, h * 0.36, peak.scale.z * 0.36); cap.position.set(x, rim(x) - 200 + h - h * 0.18 + 2, z); group.add(cap);
      } else if (m.id === 'dune') {
        const mesa = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 1, 9), back);
        const h = 320 + rs() * 380;
        mesa.scale.set(300 + rs() * 300, h, 300 + rs() * 240); mesa.position.set(x, rim(x) - 120 + h / 2, z); group.add(mesa);
      } else {
        const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), back);
        hill.scale.set(700 + rs() * 600, 360 + rs() * 380, 520 + rs() * 380); hill.position.set(x, rim(x) - 160, z); group.add(hill);
      }
    }
    if (m.id === 'magma') {
      const base = rim(5200) - 300, h = 2600;
      const volcano = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 14, 1, true), back);
      volcano.scale.set(1700, h, 1700); volcano.position.set(6900, base + h / 2, 500); group.add(volcano);
      const crater = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicMaterial({ color: 0xff6a2a }));
      crater.scale.set(150, 70, 150); crater.position.set(6900, base + h - 40, 500); group.add(crater);
      lavaMats.push(crater.material);
      const plumeLight = new THREE.PointLight(0xff5a1f, 1.2, 3000); plumeLight.position.set(6900, base + h + 100, 500); group.add(plumeLight);
    }

    // Pin, cup, tee markers
    const gCup = terrain(m, CUP);
    const cup = new THREE.Mesh(new THREE.CircleGeometry(9, 20), new THREE.MeshBasicMaterial({ color: 0x14201a }));
    cup.rotation.x = -Math.PI / 2; cup.position.set(CUP, gCup + 0.6, 0); group.add(cup);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 120, 8), new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }));
    pole.position.set(CUP, gCup + 60, 0); group.add(pole);
    const flagGeo = new THREE.PlaneGeometry(48, 28, 12, 4);
    const flagBase = Float32Array.from(flagGeo.attributes.position.array as ArrayLike<number>);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color: 0xe0412b, side: THREE.DoubleSide }));
    flag.position.set(CUP + 24, gCup + 106, 0); group.add(flag);
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (const z of [-40, 40]) {
      const t = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), white);
      t.position.set(TEE_X + 35, terrain(m, TEE_X) + 4, z); group.add(t);
    }

    // Signs
    const postMat = new THREE.MeshLambertMaterial({ color: 0x8b5e3c });
    const signPost = (x: number, z: number, h: number, mat = postMat) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(3, h, 3), mat);
      p.position.set(x, ground(m, x, z) + h / 2, z); group.add(p);
    };
    m.hazards.forEach((hz, i) => {
      const x = L.PIT[i][0] - 60;
      signPost(x, -175, 40);
      sprite(group, hz.sign, x, ground(m, x, -175) + 50, -175, 20, '#8B5E3C', '#FFF7E6');
    });
    L.PADS.forEach((px, i) => sprite(group, `LAUNCH PAD ${i + 1}`, px - 14, terrain(m, px) + 96, 0, 22, C.pad, '#10251A'));
    for (const yds of [200, 100]) {
      const x = CUP - (yds * 3) / FT_PER_UNIT;
      signPost(x, -125, 24, white);
      sprite(group, String(yds), x, terrain(m, x) + 34, -125, 14, 'rgba(255,255,255,0.95)', '#10251A');
    }

    // Fairway obstacles
    const anims: ObstacleAnim[] = [];
    m.obstacles.forEach((ob, i) => {
      const ox = L.OBST[i];
      anims.push(buildObstacle3D(THREE, group, ob.type, ox, terrain(m, ox), m));
      signPost(ox - 70, 175, 40);
      sprite(group, ob.sign, ox - 70, ground(m, ox - 70, 175) + 50, 175, 20, '#8B5E3C', '#FFF7E6');
    });

    // Everything solid casts a shadow, except the ground and liquids (which only receive them).
    group.traverse((o: T3) => { if (o.isMesh && !o.userData.noCast && !o.isSprite) o.castShadow = true; });
    group.visible = false;
    scene.add(group);
    const w: World = { group, padMats, lavaMats, flagGeo, flagBase, m, anims };
    worlds.set(mi, w);
    return w;
  }

  let current: World | null = null;
  function useMap(mi: number) {
    if (current && current.m === MAPS[mi]) return;
    if (current) current.group.visible = false;
    current = worlds.get(mi) ?? buildWorld(mi);
    current.group.visible = true;
    const m = current.m;
    scene.background = new THREE.Color(hex(m.sky.fog));
    scene.fog.color.setHex(hex(m.sky.fog));
    skyMat.uniforms.top.value.setHex(hex(m.sky.top));
    skyMat.uniforms.horizon.value.setHex(hex(m.sky.fog));
    skyMat.uniforms.sunCol.value.setHex(hex(m.sky.sun));
    const dark = m.id === 'magma';
    hemi.color.setHex(dark ? 0xffb080 : 0xe4f2ff);
    hemi.groundColor.setHex(dark ? 0x201010 : 0x3b5b3f);
    hemi.intensity = dark ? 0.6 : 0.68;
    sun.color.setHex(hex(m.sky.sun));
    sun.intensity = dark ? 0.55 : 0.9;
  }

  // ---------- balls ----------
  const ballGeo = new THREE.SphereGeometry(BALL_R, 24, 16);
  const ballMat = new THREE.MeshPhongMaterial({ map: ballTexture(THREE, '#FFFFFF'), shininess: 70, specular: 0x666666, emissive: 0x2a2a2a });
  const goldMat = new THREE.MeshPhongMaterial({ map: ballTexture(THREE, '#F2C230'), shininess: 80, specular: 0x886622, emissive: 0x4a3400 });
  const youMat = new THREE.MeshPhongMaterial({ map: ballTexture(THREE, '#FF5A3C'), shininess: 70, specular: 0x666666, emissive: 0x401008 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(BALL_R * 1.6, BALL_R * 2.2, 24), new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
  const shadowGeo = new THREE.CircleGeometry(BALL_R * 1.1, 16);
  type BallObj = { mesh: T3; shadow: T3; trail: T3; tag: T3; tagName: string };
  const balls: BallObj[] = [];
  const tagCache = new Map<string, { tex: T3; aspect: number }>();
  const ballObj = (i: number): BallObj => {
    while (balls.length <= i) {
      const mesh = new THREE.Mesh(ballGeo, ballMat);
      const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
      const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false }));
      tag.renderOrder = 10;
      scene.add(mesh, shadow, trail, tag);
      balls.push({ mesh, shadow, trail, tag, tagName: '' });
    }
    return balls[i];
  };
  // Each ball keeps its own spin, so it visibly rolls over the ground at the right speed.
  const spin = new Map<number, { x: number; z: number; y: number; q: T3 }>();
  const axis = new THREE.Vector3(), dq = new THREE.Quaternion();
  type BallOpts = { alpha?: number; gold?: boolean; tag?: string | null; tagStyle?: 'dark' | 'gold' | 'you'; key?: number; you?: boolean };
  const TAG_STYLE = {
    dark: { bg: 'rgba(14,36,25,0.88)', fg: '#FFFFFF' },
    gold: { bg: 'rgba(242,194,48,0.97)', fg: '#10251A' },
    you: { bg: 'rgba(255,90,60,0.97)', fg: '#FFFFFF' },
  };
  const placeBall = (b: BallObj, m: MapDef, x: number, y: number, z: number, opts: BallOpts) => {
    const a = opts.alpha ?? 1;
    b.mesh.visible = true;
    b.mesh.position.set(x, y + BALL_R - L.BALL_R, z);
    b.mesh.material = opts.gold ? goldMat : opts.you ? youMat : ballMat;
    b.mesh.scale.setScalar(Math.max(0.05, a));
    if (opts.key !== undefined) {
      let st = spin.get(opts.key);
      if (!st) { st = { x, z, y, q: new THREE.Quaternion() }; spin.set(opts.key, st); }
      const dx = x - st.x, dz = z - st.z, dist = Math.hypot(dx, dz);
      if (dist > 0.01 && dist < 200) {
        axis.set(dz, 0, -dx).normalize();
        st.q.premultiply(dq.setFromAxisAngle(axis, dist / BALL_R));
      }
      st.x = x; st.z = z; st.y = y;
      b.mesh.quaternion.copy(st.q);
    }
    const gy = ground(m, x, z);
    const lift = y - gy;
    b.shadow.visible = lift > -5 && lift < 600;
    b.shadow.position.set(x, gy + 0.7, z);
    const s = Math.max(0.35, 1 - Math.max(0, lift) / 400);
    b.shadow.scale.set(s, s, s);
    b.shadow.material.opacity = 0.32 * s * a;
    if (opts.you && a > 0.3) { ring.visible = true; ring.position.set(x, gy + 1, z); }
    const style = opts.tagStyle ?? 'dark';
    if (opts.tag) {
      const key = style + ':' + opts.tag;
      if (b.tagName !== key) {
        let t = tagCache.get(key);
        if (!t) {
          t = textTexture(THREE, opts.tag, { ...TAG_STYLE[style], font: '700 34px ui-monospace, Menlo, monospace', pad: 14, h: 52 });
          tagCache.set(key, t);
        }
        b.tag.material.map = t.tex; b.tag.material.needsUpdate = true;
        b.tag.userData.aspect = t.aspect; b.tagName = key;
      }
      b.tag.visible = true;
      b.tag.position.set(x, y + BALL_R + 22, z);
      const hgt = Math.max(9, camera.position.distanceTo(b.tag.position) * 0.045);
      b.tag.scale.set(hgt * b.tag.userData.aspect, hgt, 1);
    } else b.tag.visible = false;
  };
  const hideFrom = (i: number) => { for (let k = i; k < balls.length; k++) { const b = balls[k]; b.mesh.visible = b.shadow.visible = b.trail.visible = b.tag.visible = false; } };

  // ---------- particles ----------
  const MAXP = 4000;
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 7, vertexColors: true, sizeAttenuation: true })));
  let pN = 0;
  const pc = new THREE.Color();
  const pushP = (x: number, y: number, z: number, c: number) => {
    if (pN >= MAXP) return;
    pPos[pN * 3] = x; pPos[pN * 3 + 1] = y; pPos[pN * 3 + 2] = z;
    pc.setHex(c); pCol[pN * 3] = pc.r; pCol[pN * 3 + 1] = pc.g; pCol[pN * 3 + 2] = pc.b;
    pN++;
  };
  const burst = (m: MapDef, x: number, y: number, z: number, a: number, seed: number, cols: number[], count: number, speed: number, gravity: number, life: number, floor = true) => {
    if (a < 0 || a > life || reduce) return;
    const r = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const th = r() * Math.PI * 2, up = 0.35 + r() * 0.65, sp = speed * (0.4 + r() * 0.8);
      const px = x + Math.cos(th) * sp * (1 - up) * a, pz = z + Math.sin(th) * sp * (1 - up) * a;
      const py = y + up * sp * a - 0.5 * gravity * a * a;
      if (floor && py < ground(m, px, pz) - 3 && a > 0.1) continue;
      pushP(px, py, pz, cols[i % cols.length]);
    }
  };
  const hazardFx: Record<HazardType, { cols: number[]; n: number; sp: number; g: number; life: number }> = {
    water: { cols: [0xddeeff, 0xffffff, 0x9cc8ee], n: 60, sp: 180, g: 420, life: 1.2 },
    lava: { cols: [0xffd23f, 0xff7a1f, 0xff3d00, 0x444444], n: 70, sp: 210, g: 300, life: 1.5 },
    quicksand: { cols: [0xd8b878, 0xb8914f, 0xf2dfae], n: 50, sp: 110, g: 300, life: 1.2 },
    void: { cols: [0xbbbbbb, 0x888888], n: 24, sp: 60, g: 80, life: 1.2 },
  };

  // ---------- camera ----------
  const camPos = new THREE.Vector3(TEE_X + 200, 400, -200);
  const camLook = new THREE.Vector3(TEE_X + 900, 100, 0);
  const tPos = new THREE.Vector3(), tLook = new THREE.Vector3();
  let view: CourseView = { playback: null, teeCount: 0, map: 0 };

  // Highest ground around x: the camera glides over pits and chasms instead of dropping into them.
  function camFloor(m: MapDef, x: number) {
    let h = -Infinity;
    for (let k = -300; k <= 300; k += 50) h = Math.max(h, terrain(m, x + k));
    return h;
  }

  function aim(now: number, m: MapDef) {
    const pb = view.playback;
    const T = (x: number) => terrain(m, x);
    if (!pb) {
      const t = reduce ? 0 : now / 1000;
      const k = (1 - Math.cos((t * 2 * Math.PI) / 48)) / 2;
      const x = TEE_X + 80 + k * (CUP - TEE_X - 420);
      tPos.set(x, camFloor(m, x) + 230, -90 + 70 * Math.sin(t / 6));
      tLook.set(x + 640, T(x + 640) + 10, 0);
      return;
    }
    const el = (Date.now() - pb.startedAt) / 1000;
    const ws = pb.shots.find((s) => s.index === pb.winner)!;
    const wEl = el - ws.launch;
    const gc = T(CUP);
    if (wEl >= ws.dur + 0.2) {
      const a = (wEl - ws.dur) * 0.35 - 0.9;
      tPos.set(CUP + Math.cos(a) * 190, gc + 70, Math.sin(a) * 190);
      tLook.set(CUP, gc + 35, 0);
      return;
    }
    if (wEl >= lastLanding(ws) - 0.35) {
      const p = posAt(m, ws, Math.min(wEl, ws.dur));
      const bx = p ? p.x : CUP, by = p ? p.y : gc, bz = p ? p.z : 0;
      const gap = Math.hypot(CUP - bx, bz);
      tPos.set(CUP - 70 - gap * 0.4, gc + 34 + gap * 0.14 + Math.max(0, by - gc) * 0.4, -110 - Math.min(90, gap * 0.3));
      tLook.set((bx + CUP) / 2, (by + gc) / 2 + 8, bz / 2);
      return;
    }
    // Cut to an obstacle while balls are reaching it.
    const focus = el > 1.1 ? obstacleFocus(m, pb.shots, el) : null;
    if (focus) {
      const ox = L.OBST[focus.stage], og = T(ox);
      tPos.set(ox - 175, og + 80, focus.z * 0.4 - 150);
      tLook.set(ox - 10, og + 45, focus.z * 0.6);
      return;
    }
    const moving = pb.shots
      .map((s) => ({ s, p: posAt(m, s, el - s.launch) }))
      .filter((q) => q.p && !q.p.gone && !q.p.rest && el - q.s.launch < q.s.dur);
    if (el < 1.1 || moving.length === 0) {
      const g = T(TEE_X);
      tPos.set(TEE_X - 170, g + 55, 28);
      tLook.set(TEE_X + 650, g + 90, 0);
      return;
    }
    let lead = moving[0];
    for (const q of moving) if (q.p!.x > lead.p!.x) lead = q;
    const lx = lead.p!.x, ly = lead.p!.y, lz = lead.p!.z;
    const near = moving.filter((q) => q.p!.x > lx - 900);
    const tail = Math.min(...near.map((q) => q.p!.x));
    const back = 260 + Math.min(420, (lx - tail) * 0.35);
    const cx = lx - back;
    const floorY = Math.max(camFloor(m, cx), T(lx), T(lx + 200));
    tPos.set(cx, Math.max(ly + 70, floorY + 70), lz * 0.5 - 70);
    tLook.set(lx + 160, Math.max(ly * 0.65 + T(lx + 160) * 0.35, floorY), lz * 0.8);
  }

  // ---------- frame ----------
  let raf = 0, last = performance.now(), alive = true;
  const resize = () => {
    const w = canvas.clientWidth || 1000;
    const h = Math.round((w * 480) / 1000);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 700 ? 1.5 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  function frame(now: number) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const pb = view.playback;
    if (!pb && spin.size) spin.clear();
    useMap(pb ? pb.map : view.map);
    const w = current!, m = w.m;
    aim(now, m);
    const kp = 1 - Math.exp(-dt * 2.6), kl = 1 - Math.exp(-dt * 3.6);
    camPos.lerp(tPos, kp); camLook.lerp(tLook, kl);
    camPos.y = Math.max(camPos.y, ground(m, camPos.x, camPos.z) + 22, camFloor(m, camPos.x) - 60);
    camera.position.copy(camPos); camera.lookAt(camLook);
    sky.position.copy(camPos);
    // Keep the sun's shadow box centred on what the camera is looking at.
    sun.target.position.copy(camLook);
    sun.position.copy(camLook).add(SUN_OFFSET);
    // Ripples drifting across the water
    if (!reduce) waterBump.offset.set((now / 9000) % 1, (now / 14000) % 1);
    ring.visible = false;

    // Flag wave, pad pulse, lava glow
    const fp = w.flagGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const bx = w.flagBase[i * 3], by = w.flagBase[i * 3 + 1], along = (bx + 24) / 48;
      fp.setXYZ(i, bx, by, reduce ? 0 : Math.sin(now / 220 + along * 5) * 5 * along);
    }
    fp.needsUpdate = true;
    const pulse = reduce ? 1 : 0.75 + 0.25 * Math.sin(now / 180);
    const padC = new THREE.Color(hex(m.colors.pad));
    for (const pm of w.padMats) pm.color.copy(padC).multiplyScalar(pulse);
    const lavaC = new THREE.Color(hex(m.fill.lava));
    for (const lm of w.lavaMats) lm.color.copy(lavaC).multiplyScalar(reduce ? 1 : 0.85 + 0.15 * Math.sin(now / 400));

    pN = 0;
    // Obstacles react to the balls reaching them this round
    const obHits: ObstacleHit[][] = [[], []];
    if (pb) {
      const el = (Date.now() - pb.startedAt) / 1000;
      for (const s of pb.shots) for (const h of s.hits) {
        const p = posAt(m, s, h.t);
        obHits[h.stage].push({ a: el - s.launch - h.t, fail: h.fail, z: p ? p.z : 0 });
      }
    }
    w.anims.forEach((anim, i) => anim(now, obHits[i], pushP, reduce));
    let used = 0;
    const teeY = terrain(m, TEE_X) + L.BALL_R;
    const teeSpot = (i: number) => [TEE_X - 10 - (i % 4) * 14, -21 + Math.floor(i / 4) * 14];
    if (!pb) {
      for (const s of view.resting ?? []) {
        if (s.end !== 'rest') continue;
        placeBall(ballObj(used), m, s.xF, terrain(m, s.xF) + L.BALL_R, s.zF, { alpha: 0.8, you: s.index === view.you });
        ballObj(used).trail.visible = false; used++;
      }
      for (let i = 0; i < Math.min(view.teeCount, 12); i++) {
        const [x, z] = teeSpot(i);
        placeBall(ballObj(used), m, x, teeY, z, {});
        ballObj(used).trail.visible = false; used++;
      }
    } else {
      const el = (Date.now() - pb.startedAt) / 1000;
      const ws = pb.shots.find((s) => s.index === pb.winner)!;
      const finale = el - ws.launch >= lastLanding(ws) - 0.35;
      const waiting = pb.shots.filter((s) => el < s.launch);
      waiting.forEach((_, i) => {
        const [x, z] = teeSpot(i);
        placeBall(ballObj(used), m, x, teeY, z, {});
        ballObj(used).trail.visible = false; used++;
      });
      const airborne: { b: BallObj; x: number; y: number; z: number; name?: string; key: number }[] = [];
      for (const s of pb.shots) {
        const t = el - s.launch;
        for (const e of shotEvents(m, s)) {
          const a = t - e.t, seed = s.index * 131 + Math.round(e.t * 10);
          if (e.type === 'launch') burst(m, e.x, e.y + 3, e.z, a, seed, [0xd9c9a3, 0xa8c98f], 14, 70, 140, 0.6);
          else if (e.type === 'pad') burst(m, e.x, e.y + 4, e.z, a, seed, [hex(m.colors.pad), 0xffffff], 40, 160, 120, 0.8);
          else if (e.type === 'land') burst(m, e.x, e.y + 3, e.z, a, seed, [hex(m.colors.fairway), hex(m.colors.fringe)], 12, 60, 300, 0.5);
          else if (e.type === 'obstacle') { if (e.fail) burst(m, e.x - 20, e.y + 20, e.z, a, seed, [0xffffff, 0xf2c230], 18, 110, 200, 0.6); }
          else if (e.hazard) { const f = hazardFx[e.hazard]; burst(m, e.x, e.y, e.z, a, seed, f.cols, f.n, f.sp, f.g, f.life, e.hazard !== 'void'); }
        }
        const p = posAt(m, s, t);
        if (!p || p.gone) continue;
        const b = ballObj(used++);
        const mine = s.index === view.you;
        const myTag = mine ? `YOU · ${pb.players[s.index] ?? ''}` : null;
        if (p.sink !== undefined) {
          placeBall(b, m, p.x, p.y, p.z, { alpha: 1 - p.sink, gold: true, tag: (mine ? myTag : pb.players[s.index]) ?? null, tagStyle: 'gold', key: s.index });
          b.trail.visible = false;
          continue;
        }
        // Your ball always wears its tag; otherwise tags go to the winner at the finish.
        const tag = mine ? myTag : finale && s.index === pb.winner ? pb.players[s.index] ?? null : null;
        placeBall(b, m, p.x, p.y, p.z, { alpha: p.fade ?? 1, tag, tagStyle: mine ? 'you' : 'dark', key: s.index, you: mine });
        if (p.air && !mine) {
          airborne.push({ b, x: p.x, y: p.y, z: p.z, name: pb.players[s.index], key: s.index });
        }
        if (p.air) {
          const arr = b.trail.geometry.attributes.position.array as Float32Array;
          for (let k = 0; k < 16; k++) {
            const q = posAt(m, s, Math.max(0, t - k * 0.03)) ?? p;
            arr[k * 3] = q.x; arr[k * 3 + 1] = q.y + BALL_R - L.BALL_R; arr[k * 3 + 2] = q.z;
          }
          b.trail.geometry.attributes.position.needsUpdate = true;
          b.trail.geometry.computeBoundingSphere();
          b.trail.visible = true;
        } else b.trail.visible = false;
      }
      if (!finale) for (const a of airborne.slice(-3)) if (a.name) placeBall(a.b, m, a.x, a.y, a.z, { tag: a.name, key: a.key });
      const ca = el - (ws.launch + ws.dur);
      if (ca >= 0 && ca < 4.5 && !reduce) {
        const r = mulberry32(99);
        const cols = [0xf2c230, 0xe0412b, 0xffffff, 0x8ed77f, 0x7fc8f8];
        for (let i = 0; i < 260; i++) {
          const th = r() * Math.PI * 2, sp = 60 + r() * 160, up = 200 + r() * 260;
          const x = CUP + Math.cos(th) * sp * ca, zz = Math.sin(th) * sp * ca;
          const y = terrain(m, CUP) + up * ca - 0.5 * 240 * ca * ca;
          if (y < ground(m, x, zz)) continue;
          pushP(x, y, zz, cols[i % cols.length]);
        }
      }
    }
    hideFrom(used);
    pGeo.setDrawRange(0, pN);
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    update(v: CourseView) { view = v; },
    destroy() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); renderer.dispose(); },
  };
}
