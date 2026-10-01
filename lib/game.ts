// Shared by the server and the browser. Given a round's seed and entry count,
// everyone computes the same course, the same winner and the same shot for every
// ball, so all visitors watch the identical round and anyone can re-check it.
//
// Every course is a three-stage par 5 seen along its length (x) with height (y)
// and a sideways spread (z, used by the 3D view). Balls that survive a stage roll
// onto a launch pad and get fired into the next stage.

// ---------- layout shared by every map ----------
export const LAYOUT = {
  TEE_X: 150,
  PADS: [1950, 3360] as const,
  HAZ: [[760, 1090], [2080, 2560], [3470, 3770]] as const,      // where a ball can land in each hazard
  PIT: [[722, 1128], [2010, 2620], [3425, 3810]] as const,      // full pit width
  OBST: [1760, 3150] as const,                                   // obstacle on each fairway, before the pad
  LAND: [[1480, 1700], [2900, 3090]] as const,                   // survivors land here, get past the obstacle and roll onto the pad
  STALL: [[1250, 1690], [2700, 3080]] as const,                  // balls that stop short
  APPROACH: [3870, 4055] as const,
  BUNKER: [4082, 4145] as const,
  GREEN: [4180, 4570] as const,
  LONG: [4700, 4980] as const,
  CUP: 4380,
  WORLD: [-500, 5300] as const,
  YARDS: 740,
  BALL_R: 5,
};
const L = LAYOUT;
const FT_PER_UNIT = (L.YARDS * 3) / (L.CUP - L.TEE_X);

export type HazardType = 'water' | 'lava' | 'quicksand' | 'void';
export type Theme = 'links' | 'dune' | 'glacier' | 'magma';

export type ObstacleType = 'windmill' | 'sprinkler' | 'tumbleweeds' | 'sandworm' | 'snowman' | 'icespikes' | 'geyser' | 'boulder';
export type Obstacle = {
  type: ObstacleType;
  sign: string;
  label: string;                                   // result text for a ball it stops
  mode: 'knock' | 'eat' | 'blast' | 'freeze';      // what happens to a ball it catches
  hop: number;                                     // how high survivors bounce over it (0 = roll straight through)
};

export type MapDef = {
  id: Theme;
  name: string;
  // The hole drops from tee to green; each fairway slopes downhill into its launch pad.
  heights: { tee: number; f1top: number; f1bot: number; f2top: number; f2bot: number; app: number };
  hazards: { type: HazardType; pit: number; label: string; sign: string }[];   // pit = depth below the lower rim
  sky: { top: string; low: string; fog: string; sun: string };
  colors: { fairway: string; fairway2: string; rough: string; bank: string; green: string; fringe: string; tee: string; sand: string; rock: string; rockDeep: string; pad: string };
  fill: Record<HazardType, string>;
  props: 'trees' | 'cactus' | 'pines' | 'deadtrees';
  obstacles: [Obstacle, Obstacle];
};

const FILL = { water: '#2F7CC0', lava: '#FF5A1F', quicksand: '#B8914F', void: '#0B0F14' };

export const MAPS: MapDef[] = [
  {
    id: 'links', name: 'Greenway Links',
    heights: { tee: 520, f1top: 420, f1bot: 310, f2top: 260, f2bot: 150, app: 110 },
    hazards: [
      { type: 'water', pit: -110, label: 'In the lake', sign: 'THE LAKE' },
      { type: 'water', pit: -90, label: 'In the river', sign: 'THE RIVER' },
      { type: 'water', pit: -80, label: 'In the pond', sign: 'THE POND' },
    ],
    sky: { top: '#4F97CF', low: '#CFE7F3', fog: '#9FCBE8', sun: '#FFF4D6' },
    colors: { fairway: '#5EA94F', fairway2: '#4F9A44', rough: '#3E8A42', bank: '#356F39', green: '#7FCB70', fringe: '#68B45B', tee: '#6FB862', sand: '#E9D59C', rock: '#8A7760', rockDeep: '#5E5041', pad: '#29E0FF' },
    fill: FILL, props: 'trees',
    obstacles: [
      { type: 'windmill', sign: 'WINDMILL', label: 'Bounced off the windmill', mode: 'knock', hop: 0 },
      { type: 'sprinkler', sign: 'SPRINKLER', label: 'Swatted by the sprinkler', mode: 'knock', hop: 48 },
    ],
  },
  {
    id: 'dune', name: 'Dune Run',
    heights: { tee: 560, f1top: 450, f1bot: 330, f2top: 280, f2bot: 170, app: 130 },
    hazards: [
      { type: 'quicksand', pit: -80, label: 'Swallowed by quicksand', sign: 'QUICKSAND' },
      { type: 'void', pit: -700, label: 'Lost in the canyon', sign: 'THE GAP' },
      { type: 'quicksand', pit: -60, label: 'Stuck in the sinkhole', sign: 'SINKHOLE' },
    ],
    sky: { top: '#E98A5B', low: '#F8D6A3', fog: '#F1C28E', sun: '#FFE9B0' },
    colors: { fairway: '#D6B26E', fairway2: '#CBA562', rough: '#B98B52', bank: '#A57744', green: '#8DBE62', fringe: '#A6B866', tee: '#C9AE72', sand: '#F2DFAE', rock: '#A0643C', rockDeep: '#6E3F24', pad: '#FF3DB8' },
    fill: FILL, props: 'cactus',
    obstacles: [
      { type: 'tumbleweeds', sign: 'TUMBLEWEEDS', label: 'Tangled in a tumbleweed', mode: 'knock', hop: 62 },
      { type: 'sandworm', sign: 'WORM CROSSING', label: 'Eaten by the sandworm', mode: 'eat', hop: 0 },
    ],
  },
  {
    id: 'glacier', name: 'Glacier Peak',
    heights: { tee: 720, f1top: 590, f1bot: 440, f2top: 370, f2bot: 230, app: 170 },
    hazards: [
      { type: 'void', pit: -700, label: 'Fell into the crevasse', sign: 'CREVASSE' },
      { type: 'water', pit: -45, label: 'Through the ice', sign: 'FROZEN LAKE' },
      { type: 'void', pit: -700, label: 'Lost in the ice cave', sign: 'ICE CAVE' },
    ],
    sky: { top: '#7FA9D6', low: '#E4EEF8', fog: '#D3E2F1', sun: '#FFFFFF' },
    colors: { fairway: '#EAF2F8', fairway2: '#DCE8F2', rough: '#C7D7E6', bank: '#B3C6D8', green: '#8FD0B4', fringe: '#A9DCC6', tee: '#D8E6F2', sand: '#FFFFFF', rock: '#7E8C9C', rockDeep: '#4E5A68', pad: '#4DA3FF' },
    fill: { ...FILL, water: '#7FC4E8' }, props: 'pines',
    obstacles: [
      { type: 'snowman', sign: 'SNOWMAN', label: 'Bonked the snowman', mode: 'knock', hop: 128 },
      { type: 'icespikes', sign: 'ICE SPIKES', label: 'Frozen on the ice spikes', mode: 'freeze', hop: 58 },
    ],
  },
  {
    id: 'magma', name: 'Magma Isle',
    heights: { tee: 600, f1top: 490, f1bot: 370, f2top: 310, f2bot: 190, app: 140 },
    hazards: [
      { type: 'lava', pit: -90, label: 'Melted in the lava', sign: 'LAVA FLOW' },
      { type: 'lava', pit: -110, label: 'Into the magma', sign: 'MAGMA RIVER' },
      { type: 'lava', pit: -70, label: 'Burned in the vent', sign: 'THE VENT' },
    ],
    sky: { top: '#2A1A2E', low: '#8A3B2E', fog: '#5A2A2A', sun: '#FF9A4A' },
    colors: { fairway: '#5B7A3A', fairway2: '#50703A', rough: '#3B3A2E', bank: '#2F2B26', green: '#6FA046', fringe: '#5E8A3E', tee: '#56733A', sand: '#8A7A66', rock: '#3A302A', rockDeep: '#211A16', pad: '#FFD23F' },
    fill: FILL, props: 'deadtrees',
    obstacles: [
      { type: 'geyser', sign: 'FIRE GEYSER', label: 'Blasted by a fire geyser', mode: 'blast', hop: 0 },
      { type: 'boulder', sign: 'ROCKSLIDE', label: 'Flattened by a boulder', mode: 'knock', hop: 84 },
    ],
  },
];

/** Which course a round plays on. Drawn from its own slice of the seed. */
export function mapIndexForSeed(seed: number) {
  const r = mulberry32((seed ^ 0x6c8e9cf5) >>> 0)();
  return Math.floor(r * MAPS.length);
}

// ---------- terrain ----------
type Profile = [number, number][];
const profiles = new Map<Theme, Profile>();
function profile(m: MapDef): Profile {
  let p = profiles.get(m.id);
  if (p) return p;
  const h = m.heights;
  const a0 = h.tee - 70, d1 = h.f1top - h.f1bot, d2 = h.f2top - h.f2bot, green = h.app - 30;
  // Each pit sits below the lower of its two rims (a chasm's "depth" is just very deep).
  const pit = (i: number, left: number, right: number) => Math.min(left, right) + m.hazards[i].pit;
  const p1 = pit(0, a0 - 6, h.f1top), p2 = pit(1, h.f1bot + 22, h.f2top), p3 = pit(2, h.f2bot + 22, h.app);
  p = [
    [-900, h.tee], [270, h.tee], [340, h.tee - 15], [600, a0], [690, a0 - 6], [722, p1], [1128, p1],
    // Fairway 1: downhill in uneven steps so the ball speeds up and settles, into the pad's kicker ramp
    [1172, h.f1top], [1330, h.f1top - d1 * 0.28], [1450, h.f1top - d1 * 0.4], [1580, h.f1top - d1 * 0.62], [1700, h.f1top - d1 * 0.78],
    [1840, h.f1bot], [1915, h.f1bot - 6], [1950, h.f1bot + 26], [1972, h.f1bot + 22], [2010, p2], [2620, p2],
    // Fairway 2
    [2660, h.f2top], [2800, h.f2top - d2 * 0.25], [2930, h.f2top - d2 * 0.42], [3060, h.f2top - d2 * 0.65], [3200, h.f2top - d2 * 0.85],
    [3250, h.f2bot], [3325, h.f2bot - 6], [3360, h.f2bot + 26], [3382, h.f2bot + 22], [3425, p3], [3810, p3],
    // Approach runs down past the bunker onto a green that tilts gently toward the back
    [3852, h.app], [4060, h.app - 28], [4082, h.app - 38], [4145, h.app - 38], [4172, green], [4380, green - 9], [4575, green - 18],
    [4645, green - 90], [5600, green - 110],
  ];
  profiles.set(m.id, p);
  return p;
}

function inPit(x: number) { return L.PIT.some(([a, b]) => x > a - 2 && x < b + 2); }

/** Ground height at distance x along the hole's centre line. */
export function terrain(m: MapDef, x: number): number {
  const P = profile(m);
  let i = 0;
  while (i < P.length - 2 && x > P[i + 1][0]) i++;
  const [x0, y0] = P[i], [x1, y1] = P[i + 1];
  const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  const base = y0 + (y1 - y0) * (1 - Math.cos(t * Math.PI)) / 2;
  const flat = x < 262 || (x > L.GREEN[0] - 10 && x < L.GREEN[1] + 10) || inPit(x) || Math.abs(x - L.PADS[0]) < 130 || Math.abs(x - L.PADS[1]) < 130;
  return flat ? base : base + 3 * Math.sin(x / 37) + 2 * Math.sin(x / 91);
}

/** Top of the hazard fill in pit i (water, lava or quicksand), or just below the rim for a chasm. */
export function hazardLevel(m: MapDef, i: number) {
  const hz = m.hazards[i];
  return hz.type === 'void' ? Math.max(terrain(m, L.PIT[i][0] - 30), terrain(m, L.PIT[i][1] + 30)) - 10 : terrain(m, (L.PIT[i][0] + L.PIT[i][1]) / 2) + 22;
}

export type Surface = 'tee' | 'rough' | 'fairway' | 'rock' | 'sand' | 'green' | 'hazard' | 'pad';
export function surfaceAt(x: number): Surface {
  if (x > 20 && x < 262) return 'tee';
  if (L.PADS.some((p) => x > p - 40 && x < p + 14)) return 'pad';
  for (const [a, b] of L.PIT) {
    if (x > a + 20 && x < b - 20) return 'hazard';
    if (x > a - 32 && x < b + 44) return 'rock';
  }
  if (x > L.BUNKER[0] && x < L.BUNKER[1]) return 'sand';
  if (x >= L.GREEN[0] && x <= L.GREEN[1]) return 'green';
  if (x > 4595) return 'rock';
  if ((x > 330 && x < 690) || (x > 1180 && x < 1990) || (x > 2660 && x < 3390) || (x > 3852 && x < L.GREEN[0])) return 'fairway';
  return 'rough';
}

// ---------- shots ----------
export type ShotKind = 'hole' | 'hazard' | 'obstacle' | 'stalled' | 'fairway' | 'bunker' | 'green' | 'long';
export type Seg =
  | { t: 'arc'; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; h: number; d: number }
  | { t: 'roll'; x0: number; x1: number; z0: number; z1: number; d: number; v0?: number; v1?: number } // v0/v1: speed in and out (units/s)
  | { t: 'hold'; x: number; z: number; d: number }                                  // charging on a launch pad
  | { t: 'fall'; x: number; z: number; y0: number; y1: number; d: number }          // dropping into a chasm
  | { t: 'sink'; x: number; z: number; y: number; d: number }                       // sinking into water/lava/quicksand
  | { t: 'poof'; x: number; z: number; y: number; rise: number; d: number };        // eaten or blasted away by an obstacle
export type Shot = {
  index: number;     // entry index in the round (entry order)
  kind: ShotKind;
  stage: number;     // 0, 1 or 2: the stage the ball finished in
  hazard: number;    // which hazard it went into (-1 if none)
  xF: number;
  zF: number;
  segs: Seg[];
  end: 'rest' | 'gone' | 'drop';
  dur: number;       // seconds from launch to finish
  launch: number;    // seconds after round playback starts
  hits: { t: number; stage: number; fail: boolean }[]; // when it reached each obstacle (seconds after launch)
};
export type Round = { map: number; winner: number; shots: Shot[]; winnerEnd: number; total: number };

/** Deterministic 32-bit PRNG. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function winnerIndex(seed: number, n: number) {
  return (seed >>> 0) % n;
}

/** Turns a hex string (from sha256) into the round's 32-bit seed. */
export function seedFromHex(hex: string) {
  return parseInt(hex.slice(0, 8), 16) >>> 0;
}

export function buildRound(seed: number, n: number): Round {
  const map = mapIndexForSeed(seed);
  const m = MAPS[map];
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const r = (a: number, b: number) => a + rnd() * (b - a);
  const winner = winnerIndex(seed, n);
  const ground = (x: number) => terrain(m, x) + L.BALL_R;

  // Tee-off order: everyone shuffled, winner goes second to last for suspense.
  const order = Array.from({ length: n }, (_, i) => i).filter((i) => i !== winner);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.splice(Math.max(order.length - 1, 0), 0, winner);
  const gap = Math.min(0.6, 7 / n);

  const shots: Shot[] = order.map((idx, k) => {
    const isWin = idx === winner;
    const segs: Seg[] = [];
    let x = L.TEE_X, y = ground(L.TEE_X), z = r(-16, 16);
    let kind: ShotKind = 'hole', stage = 0, hazard = -1, end: Shot['end'] = 'rest', out = false;
    const hits: Shot['hits'] = [];
    const elapsed = () => segs.reduce((acc, g) => acc + g.d, 0);

    const fly = (x1: number, y1: number, z1: number, H: number) => {
      segs.push({ t: 'arc', x0: x, x1, y0: y, y1, z0: z, z1, h: H, d: 1.9 + ((x1 - x) / 1700) * 1.3 });
      x = x1; y = y1; z = z1;
    };
    // A roll that keeps the ball's speed: it comes in at v0 and leaves at v1 (0 = comes to rest).
    const roll = (x1: number, z1: number, v0: number, v1: number) => {
      const L = Math.abs(x1 - x);
      const d = L < 2 ? 0.2 : Math.max(0.25, Math.min(2.8, (2.3 * L) / (v0 + v1 + 1)));
      const cap = (v: number) => Math.min(v, (2.6 * L) / d);
      segs.push({ t: 'roll', x0: x, x1, z0: z, z1, d, v0: cap(v0), v1: cap(v1) });
      x = x1; y = ground(x1); z = z1;
    };
    // Two shrinking bounces, then a roll that carries the speed from the last bounce.
    const bounceRoll = (xF: number, zF: number, H: number, endV: number) => {
      const run = xF - x;
      const b1 = x + run * 0.42, b2 = b1 + run * 0.22;
      const z1 = z + (zF - z) * 0.4, z2 = z + (zF - z) * 0.6;
      segs.push({ t: 'arc', x0: x, x1: b1, y0: y, y1: ground(b1), z0: z, z1, h: H * 0.1, d: 0.5 });
      segs.push({ t: 'arc', x0: b1, x1: b2, y0: ground(b1), y1: ground(b2), z0: z1, z1: z2, h: H * 0.03, d: 0.28 });
      x = b2; y = ground(b2); z = z2;
      roll(xF, zF, (b2 - b1) / 0.28, endV);
    };
    const intoHazard = (i: number, H: number) => {
      const [a, b] = L.HAZ[i];
      const xL = r(a, b), level = hazardLevel(m, i);
      fly(xL, level, r(-110, 110), H);
      if (m.hazards[i].type === 'void') segs.push({ t: 'fall', x, z, y0: level, y1: level - 420, d: 1.1 });
      else segs.push({ t: 'sink', x, z, y: level, d: 0.5 });
      kind = 'hazard'; hazard = i; end = 'gone'; out = true;
    };

    // Stages 1 and 2: carry the hazard and roll onto the launch pad, or go out.
    for (let s = 0; s < 2 && !out; s++) {
      stage = s;
      const H = s === 0 ? r(280, 400) : r(340, 480);
      const p = isWin ? 1 : rnd();
      if (p < 0.2) { intoHazard(s, H); break; }
      if (p >= 0.32 && p < 0.38) {
        const [a, b] = L.STALL[s];
        const xF = r(a, b), xL = Math.max(a - 50, xF - r(40, 150));
        fly(xL, ground(xL), r(-95, 95), H);
        bounceRoll(xF, Math.max(-110, Math.min(110, z + r(-25, 25))), H, 0);
        kind = 'stalled'; out = true;
        break;
      }
      // Land on the fairway and roll up to the obstacle.
      const ob = m.obstacles[s], ox = L.OBST[s];
      const [a, b] = L.LAND[s];
      const xL = r(a, b);
      fly(xL, ground(xL), r(-90, 90), H);
      bounceRoll(ox - 22, z * 0.8, H, 120);
      const fail = !isWin && p < 0.32;
      hits.push({ t: elapsed(), stage: s, fail });
      if (fail) {
        kind = 'obstacle'; out = true;
        if (ob.mode === 'knock') {
          const xB = ox - r(70, 170), zB = Math.max(-110, Math.min(110, z + r(-45, 45)));
          segs.push({ t: 'arc', x0: x, x1: xB, y0: y, y1: ground(xB), z0: z, z1: zB, h: 34, d: 0.65 });
          x = xB; z = zB; y = ground(xB);
          roll(xB - r(8, 30), z, 60, 0);
        } else if (ob.mode === 'freeze') {
          roll(ox - 6, z, 120, 0);
        } else {
          segs.push({ t: 'poof', x: ox - 12, z, y: ground(ox - 12), rise: ob.mode === 'blast' ? 260 : 26, d: ob.mode === 'blast' ? 1.1 : 0.7 });
          end = 'gone'; x = ox - 12;
        }
        break;
      }
      // Get past it: bounce over the top, or roll straight through.
      if (ob.hop > 0) {
        segs.push({ t: 'arc', x0: x, x1: ox + 34, y0: y, y1: ground(ox + 34), z0: z, z1: z, h: ob.hop, d: 0.5 });
        x = ox + 34; y = ground(x);
      } else roll(ox + 34, z, 120, 125);
      // Downhill toward the pad, then up its kicker ramp, slowing as it climbs onto the pad.
      roll(L.PADS[s] - 60, z * 0.7, 125, 190);
      roll(L.PADS[s], z * 0.6, 190, 25);
      segs.push({ t: 'hold', x, z, d: 0.35 });
      y = ground(x) + 4;
    }

    // Final stage, launched from the second pad.
    if (!out) {
      stage = 2;
      const H = r(340, 470);
      const p = isWin ? -1 : rnd();
      if (p >= 0 && p < 0.12) intoHazard(2, H);
      else {
        let xF: number, zF: number, run: number;
        if (isWin) { kind = 'hole'; xF = L.CUP; zF = 0; run = r(110, 190); }
        else if (p < 0.28) { kind = 'fairway'; xF = r(L.APPROACH[0], L.APPROACH[1]); zF = r(-90, 90); run = Math.min(r(40, 120), xF - 3860); }
        else if (p < 0.42) { kind = 'bunker'; xF = r(L.BUNKER[0] + 8, L.BUNKER[1] - 8); zF = r(-35, 35); run = r(6, 16); }
        else if (p < 0.86) { kind = 'green'; xF = rnd() < 0.5 ? r(L.GREEN[0] + 10, L.CUP - 12) : r(L.CUP + 12, L.GREEN[1] - 10); zF = r(-45, 45); run = r(60, 150); }
        else { kind = 'long'; xF = r(L.LONG[0], L.LONG[1]); zF = r(-70, 70); run = r(30, xF - 4660); }
        const xL = xF - Math.max(6, run);
        fly(xL, ground(xL), kind === 'long' ? zF : zF * 0.6 + r(-20, 20), kind === 'long' ? H * 1.25 : H);
        if (kind === 'bunker') {
          segs.push({ t: 'arc', x0: x, x1: xF, y0: y, y1: ground(xF), z0: z, z1: zF, h: 6, d: 0.3 });
          x = xF; z = zF;
        } else bounceRoll(xF, zF, H, isWin ? 40 : 0);
        if (isWin) end = 'drop';
      }
    }

    const dur = segs.reduce((s, g) => s + g.d, 0) + (end === 'drop' ? 0.35 : 0);
    return { index: idx, kind, stage, hazard, xF: x, zF: z, segs, end, dur, launch: k * gap, hits };
  });

  const ws = shots.find((s) => s.index === winner)!;
  const winnerEnd = ws.launch + ws.dur;
  const total = Math.max(...shots.map((s) => s.launch + s.dur), winnerEnd) + 4.5;
  return { map, winner, shots, winnerEnd, total };
}

export function describeShot(m: MapDef, s: Shot): string {
  if (s.kind === 'hole') return 'Hole in one';
  if (s.kind === 'hazard') return m.hazards[s.hazard].label;
  if (s.kind === 'obstacle') return m.obstacles[s.stage].label;
  if (s.kind === 'stalled') return `Stopped short of launch pad ${s.stage + 1}`;
  if (s.kind === 'bunker') return 'In the bunker';
  if (s.kind === 'long') return 'Off the back';
  const ft = Math.round(Math.hypot(L.CUP - s.xF, s.zF) * FT_PER_UNIT);
  const dir = s.xF < L.CUP ? 'short' : 'long';
  return s.kind === 'fairway' ? `${Math.round(ft / 3)} yds ${dir}` : `${ft} ft ${dir}`;
}

/** Sorts best first: hole in one, then closest to the pin, then whoever got furthest before going out. */
export function shotRank(s: Shot): number {
  if (s.kind === 'hole') return -1;
  if (s.kind === 'green' || s.kind === 'bunker' || s.kind === 'fairway') return Math.hypot(L.CUP - s.xF, s.zF);
  if (s.kind === 'long') return 5000 + (s.xF - L.CUP);
  return 100000 - s.xF;
}

export type BallPos = { x: number; y: number; z: number; air: boolean; rest?: boolean; gone?: boolean; hold?: boolean; fade?: number; sink?: number };

/** Where a ball is t seconds after its launch (null before launch). */
export function posAt(m: MapDef, s: Shot, t: number): BallPos | null {
  if (t < 0) return null;
  let acc = 0;
  for (const g of s.segs) {
    if (t <= acc + g.d) {
      const p = (t - acc) / g.d;
      switch (g.t) {
        case 'arc': return { x: g.x0 + (g.x1 - g.x0) * p, y: g.y0 + (g.y1 - g.y0) * p + 4 * g.h * p * (1 - p), z: g.z0 + (g.z1 - g.z0) * p, air: g.h > 60 };
        case 'roll': {
          let x: number, e: number;
          if (g.v0 !== undefined) {
            // Cubic Hermite: starts at speed v0, ends at speed v1, so rolls flow out of bounces and into pads.
            const dir = Math.sign(g.x1 - g.x0) || 1;
            const p2 = p * p, p3 = p2 * p;
            x = (2 * p3 - 3 * p2 + 1) * g.x0 + (p3 - 2 * p2 + p) * dir * g.v0 * g.d + (-2 * p3 + 3 * p2) * g.x1 + (p3 - p2) * dir * (g.v1 ?? 0) * g.d;
            e = g.x1 === g.x0 ? p : (x - g.x0) / (g.x1 - g.x0);
          } else { e = 1 - Math.pow(1 - p, 3); x = g.x0 + (g.x1 - g.x0) * e; }
          return { x, y: terrain(m, x) + L.BALL_R, z: g.z0 + (g.z1 - g.z0) * e, air: false };
        }
        case 'hold': return { x: g.x, y: terrain(m, g.x) + L.BALL_R + 4 * Math.sin(p * Math.PI), z: g.z, air: false, hold: true };
        case 'fall': return { x: g.x, y: g.y0 + (g.y1 - g.y0) * p * p, z: g.z, air: false, fade: 1 - p };
        case 'sink': return { x: g.x, y: g.y - p * 8, z: g.z, air: false, fade: 1 - p };
        case 'poof': return { x: g.x, y: g.y + g.rise * Math.sin((p * Math.PI) / 2), z: g.z, air: false, fade: 1 - p * p };
      }
    }
    acc += g.d;
  }
  if (s.end === 'gone') return { x: s.xF, y: 0, z: s.zF, air: false, gone: true };
  if (s.end === 'drop') {
    const p = Math.min(1, (t - acc) / 0.35);
    return { x: L.CUP, y: terrain(m, L.CUP) + L.BALL_R - p * 12, z: 0, air: false, sink: p, gone: p >= 1 };
  }
  return { x: s.xF, y: terrain(m, s.xF) + L.BALL_R, z: s.zF, air: false, rest: true };
}

export type ShotEvent = { t: number; type: 'launch' | 'pad' | 'land' | 'hazard' | 'obstacle'; x: number; y: number; z: number; hazard?: HazardType; stage?: number; fail?: boolean };

/** Moments worth an effect: tee shots, pad launches, landings and hazard entries (t is seconds after this ball's launch). */
export function shotEvents(m: MapDef, s: Shot): ShotEvent[] {
  const first = s.segs[0];
  const ev: ShotEvent[] = [{ t: 0, type: 'launch', x: L.TEE_X, y: terrain(m, L.TEE_X), z: first.t === 'arc' ? first.z0 : 0 }];
  let acc = 0;
  s.segs.forEach((g, i) => {
    const next = s.segs[i + 1];
    if (g.t === 'hold') ev.push({ t: acc + g.d, type: 'pad', x: g.x, y: terrain(m, g.x), z: g.z });
    if (g.t === 'arc' && g.h > 60) {
      if (next && (next.t === 'sink' || next.t === 'fall')) {
        ev.push({ t: acc + g.d, type: 'hazard', x: g.x1, y: g.y1, z: g.z1, hazard: s.hazard >= 0 ? m.hazards[s.hazard].type : undefined });
      } else ev.push({ t: acc + g.d, type: 'land', x: g.x1, y: terrain(m, g.x1), z: g.z1 });
    }
    acc += g.d;
  });
  for (const h of s.hits) {
    const p = posAt(m, s, h.t);
    ev.push({ t: h.t, type: 'obstacle', x: L.OBST[h.stage], y: terrain(m, L.OBST[h.stage]), z: p ? p.z : 0, stage: h.stage, fail: h.fail });
  }
  return ev;
}


// ---------- what the renderers draw ----------
export type CoursePlayback = {
  roundId: number;
  map: number;          // index into MAPS
  shots: Shot[];
  winner: number;       // entry index of the winner
  players: string[];    // names by entry index
  startedAt: number;    // Date.now() when playback began
};
export type CourseView = {
  playback: CoursePlayback | null;
  teeCount: number;
  map: number;          // course to show between rounds
  resting?: Shot[] | null; // last round's balls, shown faded between rounds
  you?: number | null;     // entry index of the viewer's own ball, highlighted on the course
};

/** Seconds after launch when the ball lands from its last big flight (the camera's cue for the finale). */
export function lastLanding(s: Shot): number {
  let acc = 0, t = 0;
  for (const g of s.segs) { acc += g.d; if (g.t === 'arc' && g.h > 60) t = acc; }
  return t;
}

/**
 * The obstacle moment the camera should cut to right now, if any: a ball reaching
 * an obstacle within the last second (or about to). Knock-outs win over clean passes.
 */
export function obstacleFocus(m: MapDef, shots: Shot[], el: number): { stage: number; z: number; a: number } | null {
  let best: { stage: number; z: number; a: number; score: number } | null = null;
  for (const s of shots) for (const h of s.hits) {
    const a = el - s.launch - h.t;
    if (a < -0.8 || a > 1.1) continue;
    const p = posAt(m, s, h.t);
    const score = (h.fail ? 10 : 0) - Math.abs(a - 0.1);
    if (!best || score > best.score) best = { stage: h.stage, z: p ? p.z : 0, a, score };
  }
  return best ? { stage: best.stage, z: best.z, a: best.a } : null;
}

export type PlayLine = { t: number; text: string; tone: 'info' | 'out' | 'good' | 'win'; who: number };

/**
 * Play-by-play for a round: what happened to each ball and when (seconds after playback starts).
 * Shared by every viewer, so everyone reads the same commentary at the same moment.
 */
export function playByPlay(m: MapDef, round: { shots: Shot[]; winner: number }, players: string[]): PlayLine[] {
  const out: PlayLine[] = [];
  const name = (s: Shot) => players[s.index] ?? 'A ball';
  for (const s of round.shots) {
    let acc = 0, pads = 0;
    for (const g of s.segs) {
      if (g.t === 'hold') { pads++; out.push({ t: s.launch + acc + g.d, text: `${name(s)} fired off launch pad ${pads}`, tone: 'good', who: s.index }); }
      acc += g.d;
    }
    if (s.kind === 'hole') continue;
    const end = s.launch + (s.kind === 'hazard' || s.kind === 'obstacle' ? (s.hits.find((h) => h.fail)?.t ?? s.dur - 0.5) : s.dur);
    const t = s.kind === 'hazard' ? s.launch + lastLanding(s) : end;
    const text = s.kind === 'hazard' ? `${name(s)}: ${m.hazards[s.hazard].label.toLowerCase()}`
      : s.kind === 'obstacle' ? `${name(s)}: ${m.obstacles[s.stage].label.toLowerCase()}`
      : s.kind === 'stalled' ? `${name(s)} stopped short of launch pad ${s.stage + 1}`
      : `${name(s)}: ${describeShot(m, s).toLowerCase()}`;
    out.push({ t, text, tone: s.kind === 'green' || s.kind === 'fairway' || s.kind === 'bunker' ? 'info' : 'out', who: s.index });
  }
  const w = round.shots.find((s) => s.index === round.winner)!;
  out.push({ t: w.launch + w.dur, text: `${name(w)} HOLE IN ONE!`, tone: 'win', who: w.index });
  return out.sort((a, b) => a.t - b.t);
}
