/**
 * Lateral road layout in "playerX" units (1.0 = paved road edge). Shared by the renderer's
 * geometry and by gameplay so what you see is where the car physically transitions.
 */
export interface RoadEdges {
  /** Edge of the paved road. */
  road: number;
  /** Outer edge of the rumble strip. */
  rumble: number;
  /** Outer edge of the paved shoulder (where guardrails stand / grass begins). */
  shoulder: number;
}

/** Fractions mirror RoadRenderer: rumble = 1/max(6, 2*lanes), shoulder = 0.45 of the road half-width. */
export function roadEdges(lanes: number): RoadEdges {
  const rumble = 1 + 1 / Math.max(6, 2 * lanes);
  return { road: 1, rumble, shoulder: rumble + 0.45 };
}
