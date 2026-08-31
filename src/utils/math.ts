// ─────────────────────────────────────────────────────────────────
//  Math utilities
// ─────────────────────────────────────────────────────────────────

/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp value between min and max */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Map value from one range to another */
export function mapRange(
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/** Predict ballistic trajectory positions */
export function ballisticPositions(
  origin: [number, number, number],
  velocity: [number, number, number],
  gravity: number,
  steps: number,
  dt: number
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i * dt;
    pts.push([
      origin[0] + velocity[0] * t,
      origin[1] + velocity[1] * t - 0.5 * gravity * t * t,
      origin[2] + velocity[2] * t,
    ]);
  }
  return pts;
}

/** Shortest distance from a 2D point P to line segment AB (Continuous Collision Detection) */
export function distToSegment2D(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/** Fisher-Yates shuffle */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Random float between min and max */
export function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Random integer between min and max (inclusive) */
export function randInt(min: number, max: number): number {
  return Math.floor(randFloat(min, max + 1));
}
