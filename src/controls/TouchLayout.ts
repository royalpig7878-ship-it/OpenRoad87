/** Touch control layout in 960x540 game space (landscape), and the maths for pedals and the virtual wheel. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ControlId = 'accel' | 'brake' | 'left' | 'right' | 'wheel' | 'gearUp' | 'gearDown' | 'manual' | 'pause' | 'steerMode';

export const TOUCH_RECTS: Record<Exclude<ControlId, 'wheel'>, Rect> = {
  accel: { x: 806, y: 326, w: 134, h: 190 },
  brake: { x: 676, y: 376, w: 118, h: 140 },
  left: { x: 20, y: 396, w: 140, h: 120 },
  right: { x: 172, y: 396, w: 140, h: 120 },
  gearUp: { x: 852, y: 212, w: 88, h: 52 },
  gearDown: { x: 852, y: 270, w: 88, h: 52 },
  manual: { x: 852, y: 178, w: 88, h: 28 },
  pause: { x: 896, y: 4, w: 60, h: 32 },
  steerMode: { x: 20, y: 290, w: 104, h: 28 },
};

/** The virtual steering wheel: centre and radius. */
export const WHEEL = { cx: 150, cy: 424, r: 104 };
/** Finger rotation (degrees) that gives full steering lock. */
export const WHEEL_LOCK_DEGREES = 60;

export type SteerMode = 'buttons' | 'wheel';

export const inRect = (r: Rect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Which control a touch at (x, y) hits, given the steering mode (only that mode's steering control exists). */
export function hitControl(x: number, y: number, mode: SteerMode): ControlId | null {
  if (inRect(TOUCH_RECTS.pause, x, y)) return 'pause';
  for (const id of ['accel', 'brake', 'gearUp', 'gearDown', 'manual'] as const) if (inRect(TOUCH_RECTS[id], x, y)) return id;
  if (inRect(TOUCH_RECTS.steerMode, x, y)) return 'steerMode';
  if (mode === 'buttons') {
    if (inRect(TOUCH_RECTS.left, x, y)) return 'left';
    if (inRect(TOUCH_RECTS.right, x, y)) return 'right';
  } else if (Math.hypot(x - WHEEL.cx, y - WHEEL.cy) <= WHEEL.r) return 'wheel';
  return null;
}

/** Pedal pressure from where the finger is: near the top is a gentle press (0.35), the bottom is full (1). */
export function pedalValue(rect: Rect, y: number): number {
  const t = Math.min(1, Math.max(0, (y - rect.y) / rect.h));
  return 0.35 + 0.65 * t;
}

export const angleOf = (x: number, y: number): number => (Math.atan2(y - WHEEL.cy, x - WHEEL.cx) * 180) / Math.PI;

/** Signed smallest difference between two angles in degrees (-180..180]. */
export function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}
