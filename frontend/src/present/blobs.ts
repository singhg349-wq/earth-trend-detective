/**
 * Persistent morphing blobs for Present mode.
 *
 * Four blobs live for the whole talk. Each step gives every blob a position,
 * size, shape and two gradient colours in a 1600 × 900 design space (stretched
 * to the viewport). Every shape compiles to an SVG path with the same command
 * structure (M + 12 C + Z), so the browser can interpolate `d` between any two
 * steps: blobs glide and reshape, they never cut.
 */

export const PALETTE = {
  black: '#000000',
  ocean: '#0b3d91',
  teal: '#1fb5c9',
  amber: '#f2a541',
  coral: '#ff5a3c',
  mint: '#8fe3c3',
  /** Darker ocean for depth (derived from ocean). */
  abyss: '#072458',
  ink: '#04121f',
} as const;

export type Pair = readonly [string, string];
export const COOL: Pair = [PALETTE.ocean, PALETTE.teal];
export const WARM: Pair = [PALETTE.amber, PALETTE.coral];
export const MINT: Pair = [PALETTE.mint, PALETTE.teal];
export const DEEP: Pair = [PALETTE.abyss, PALETTE.ocean];
export const SUN: Pair = [PALETTE.amber, PALETTE.mint];
export const EMBER: Pair = [PALETTE.coral, PALETTE.amber];

/** Radial multipliers for 12 points (top-left → clockwise). */
const SHAPES = {
  orb: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  pebble: [1.02, 0.95, 1.05, 1.0, 0.93, 1.03, 1.06, 0.96, 1.0, 1.05, 0.94, 1.0],
  bean: [1.08, 0.9, 0.98, 1.1, 1.0, 0.9, 1.04, 1.1, 0.95, 0.86, 1.0, 1.08],
  /** Map pin: rounded head, soft point at the bottom. */
  drop: [1, 1, 1, 1, 1, 1, 0.9, 1.0, 1.62, 1.0, 0.9, 1],
} as const;

export type ShapeName = keyof typeof SHAPES | 'ribbon';

export interface BlobSpec {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Degrees. */
  rot?: number;
  shape?: ShapeName;
  /** Ribbon only: wave amplitude and phase. */
  amp?: number;
  phase?: number;
  colors: Pair;
}

export type BlobLayout = readonly [BlobSpec, BlobSpec, BlobSpec, BlobSpec];

const N = 12;

function points(spec: BlobSpec): Array<[number, number]> {
  const { cx, cy, rx, ry } = spec;
  const rot = ((spec.rot ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const local: Array<[number, number]> = [];
  if (spec.shape === 'ribbon') {
    const amp = spec.amp ?? ry * 0.6;
    const phase = spec.phase ?? 0;
    const half = N / 2;
    for (let i = 0; i < half; i++) {
      const t = i / (half - 1);
      local.push([-rx + 2 * rx * t, -ry + amp * Math.sin(phase + t * Math.PI * 2.2)]);
    }
    for (let i = 0; i < half; i++) {
      const t = 1 - i / (half - 1);
      local.push([-rx + 2 * rx * t, ry + amp * Math.sin(phase + 0.5 + t * Math.PI * 2.2)]);
    }
  } else {
    const m = SHAPES[spec.shape ?? 'orb'];
    for (let i = 0; i < N; i++) {
      const a = Math.PI + Math.PI / N + (i * 2 * Math.PI) / N;
      local.push([rx * m[i] * Math.cos(a), ry * m[i] * Math.sin(a)]);
    }
  }
  return local.map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
}

const f = (n: number) => n.toFixed(1);

/** Closed Catmull–Rom spline through the blob's points, as cubic Béziers. */
export function blobPath(spec: BlobSpec): string {
  const p = points(spec);
  const k = spec.shape === 'ribbon' ? 0.2 : 0.182;
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < N; i++) {
    const p0 = p[(i - 1 + N) % N];
    const p1 = p[i];
    const p2 = p[(i + 1) % N];
    const p3 = p[(i + 2) % N];
    const c1x = p1[0] + (p2[0] - p0[0]) * k;
    const c1y = p1[1] + (p2[1] - p0[1]) * k;
    const c2x = p2[0] - (p3[0] - p1[0]) * k;
    const c2y = p2[1] - (p3[1] - p1[1]) * k;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

/** Demo steps: blobs retreat to the edges so the live app is fully usable. */
export const DEMO_LAYOUT: BlobLayout = [
  { cx: -142, cy: 470, rx: 150, ry: 250, shape: 'pebble', colors: COOL },
  { cx: 1640, cy: 940, rx: 84, ry: 84, shape: 'orb', colors: WARM },
  { cx: -140, cy: 960, rx: 100, ry: 100, shape: 'orb', colors: MINT },
  { cx: 1760, cy: -140, rx: 110, ry: 110, shape: 'orb', colors: DEEP },
];

/** Story layouts, keyed by scene id (see steps.ts). */
export const STORY_LAYOUTS: Record<string, BlobLayout> = {
  // Earth horizon rising bottom-right, a small sun, a mint moon.
  question: [
    { cx: 1240, cy: 1390, rx: 980, ry: 760, shape: 'orb', colors: COOL },
    { cx: 1395, cy: 165, rx: 104, ry: 104, shape: 'orb', colors: WARM },
    { cx: 1130, cy: 372, rx: 30, ry: 30, shape: 'orb', colors: MINT },
    { cx: -260, cy: 760, rx: 180, ry: 180, shape: 'pebble', colors: DEEP },
  ],
  // The sun becomes a map pin standing on the horizon.
  place: [
    { cx: 1200, cy: 1190, rx: 760, ry: 400, shape: 'orb', colors: COOL },
    { cx: 1200, cy: 392, rx: 176, ry: 176, rot: 15, shape: 'drop', colors: WARM },
    { cx: 118, cy: 818, rx: 58, ry: 58, shape: 'orb', colors: MINT },
    { cx: 1650, cy: 120, rx: 150, ry: 150, shape: 'pebble', colors: DEEP },
  ],
  // Files: a heavy warm mass bottom-right, cool slab bottom-left.
  locked: [
    { cx: -60, cy: 980, rx: 300, ry: 150, rot: -8, shape: 'bean', colors: DEEP },
    { cx: 1330, cy: 720, rx: 330, ry: 250, rot: 10, shape: 'bean', colors: WARM },
    { cx: 1560, cy: 70, rx: 96, ry: 96, shape: 'pebble', colors: MINT },
    { cx: 760, cy: 1080, rx: 240, ry: 110, shape: 'pebble', colors: COOL },
  ],
  // A ribbon weaves through the wordmark.
  reveal: [
    { cx: 800, cy: 392, rx: 960, ry: 30, rot: -3, shape: 'ribbon', amp: 78, phase: 0.4, colors: COOL },
    { cx: 1440, cy: 830, rx: 190, ry: 190, shape: 'pebble', colors: WARM },
    { cx: 215, cy: 150, rx: 62, ry: 62, shape: 'orb', colors: MINT },
    { cx: 120, cy: 960, rx: 260, ry: 150, shape: 'pebble', colors: DEEP },
  ],
  // Three stations of the pipeline: files → tiles → cells.
  built: [
    { cx: 300, cy: 568, rx: 182, ry: 182, shape: 'pebble', colors: COOL },
    { cx: 1300, cy: 568, rx: 182, ry: 182, rot: 40, shape: 'pebble', colors: WARM },
    { cx: 800, cy: 568, rx: 182, ry: 182, rot: 80, shape: 'pebble', colors: MINT },
    { cx: 1620, cy: 60, rx: 130, ry: 130, shape: 'orb', colors: DEEP },
  ],
  // One big cool panel carries the chart.
  method: [
    { cx: 1130, cy: 480, rx: 520, ry: 372, rot: -4, shape: 'bean', colors: DEEP },
    { cx: 70, cy: 900, rx: 150, ry: 150, shape: 'pebble', colors: WARM },
    { cx: 1560, cy: 60, rx: 72, ry: 72, shape: 'orb', colors: MINT },
    { cx: 1640, cy: 900, rx: 170, ry: 120, shape: 'pebble', colors: COOL },
  ],
  // Everything turns warm.
  link: [
    { cx: 800, cy: 330, rx: 980, ry: 32, rot: 3, shape: 'ribbon', amp: 80, phase: 2.2, colors: EMBER },
    { cx: 800, cy: 1500, rx: 1150, ry: 650, shape: 'orb', colors: WARM },
    { cx: 1085, cy: 560, rx: 34, ry: 34, shape: 'orb', colors: SUN },
    { cx: 1560, cy: 60, rx: 150, ry: 150, shape: 'pebble', colors: WARM },
  ],
  // Mid-demo annotated Alberta result card.
  albertaCard: [
    { cx: 1220, cy: 480, rx: 520, ry: 360, rot: -3, shape: 'bean', colors: DEEP },
    { cx: 140, cy: 880, rx: 160, ry: 150, shape: 'pebble', colors: WARM },
    { cx: 1560, cy: 80, rx: 72, ry: 72, shape: 'orb', colors: MINT },
    { cx: 1620, cy: 900, rx: 160, ry: 120, shape: 'pebble', colors: COOL },
  ],
  // Mid-demo Compare graphs & p-values card (before Library).
  compareCard: [
    { cx: 400, cy: 520, rx: 480, ry: 340, rot: 4, shape: 'bean', colors: DEEP },
    { cx: 1380, cy: 760, rx: 220, ry: 180, shape: 'pebble', colors: WARM },
    { cx: 1500, cy: 120, rx: 84, ry: 84, shape: 'orb', colors: MINT },
    { cx: 120, cy: 120, rx: 140, ry: 120, shape: 'pebble', colors: COOL },
  ],
  // Annotated result card + key trends (after the demo).
  result: [
    { cx: 1220, cy: 480, rx: 520, ry: 360, rot: -3, shape: 'bean', colors: DEEP },
    { cx: 140, cy: 880, rx: 160, ry: 150, shape: 'pebble', colors: WARM },
    { cx: 1560, cy: 80, rx: 72, ry: 72, shape: 'orb', colors: MINT },
    { cx: 1620, cy: 900, rx: 160, ry: 120, shape: 'pebble', colors: COOL },
  ],
  // A planet edge on the right.
  impact: [
    { cx: 1720, cy: 450, rx: 640, ry: 700, shape: 'orb', colors: COOL },
    { cx: 985, cy: 150, rx: 66, ry: 66, shape: 'orb', colors: WARM },
    { cx: 40, cy: 940, rx: 170, ry: 130, shape: 'pebble', colors: MINT },
    { cx: 1660, cy: -60, rx: 150, ry: 150, shape: 'orb', colors: DEEP },
  ],
  // The ribbon returns; mint carries the QR code.
  close: [
    { cx: 800, cy: 285, rx: 960, ry: 28, rot: 3, shape: 'ribbon', amp: 70, phase: 3.4, colors: COOL },
    { cx: 60, cy: 900, rx: 210, ry: 170, shape: 'pebble', colors: WARM },
    { cx: 1345, cy: 650, rx: 215, ry: 215, shape: 'pebble', colors: MINT },
    { cx: 1640, cy: 40, rx: 120, ry: 120, shape: 'orb', colors: DEEP },
  ],
};

export function layoutFor(step: { kind: 'story' | 'demo'; scene?: string }): BlobLayout {
  if (step.kind === 'demo') return DEMO_LAYOUT;
  return STORY_LAYOUTS[step.scene ?? ''] ?? STORY_LAYOUTS.question;
}

/** How much of the live globe shows through the black backdrop on a story slide. */
export function backdropOpacity(scene: string | undefined): number {
  return scene === 'reveal' ? 0.74 : 1;
}
