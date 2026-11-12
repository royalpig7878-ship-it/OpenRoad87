/** A point on the road in world, camera and screen space (segment-based pseudo-3D). */
export interface RoadPoint {
  world: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  screen: { x: number; y: number; w: number; scale: number };
}

/** One slice of road. Curve is lateral bend per segment, y change comes from p1/p2 heights. */
import type { SceneryItem } from './environments/EnvironmentTypes';

export interface RoadSegment {
  index: number;
  p1: RoadPoint;
  p2: RoadPoint;
  /** Lateral curvature applied across this segment (positive = right). */
  curve: number;
  /** 0 = light stripe, 1 = dark stripe (alternating bands give the sense of speed). */
  band: 0 | 1;
  /** True if a roadside barrier is drawn on both sides. */
  barrier: boolean;
  /** Which side(s) the barrier stands on: 0 = both, -1 = left only, 1 = right only. */
  barrierSide: -1 | 0 | 1;
  /** Set each frame: true when this segment is beyond the loop point relative to the camera. */
  looped: boolean;
  /** Set each frame: fog amount 0 (none)..1 (fully fogged). */
  fog: number;
  /** Set each frame: screen y above which this segment is visible (nearer hill crests hide anything below it). */
  clip: number;
  /** Roadside objects standing beside this segment. */
  scenery: SceneryItem[];
  /** Colours for this segment (blended across environment boundaries); falls back to the renderer's palette. */
  palette?: RoadPalette;
  /** Index of the zone (environment stretch) this segment belongs to. */
  zone: number;
}

/** Colours for one lighting/environment theme. All 0xRRGGBB. */
export interface RoadPalette {
  road: [number, number];
  grass: [number, number];
  rumble: [number, number];
  shoulder: [number, number];
  lane: number;
  edgeLine: number;
  barrier: [number, number];
  barrierTop: number;
  fog: number;
  /** Optional different ground colours for the left side (e.g. the sea on a coastal road). */
  groundLeft?: [number, number];
}

/** Camera and road geometry settings. */
export interface RoadConfig {
  width: number;
  height: number;
  /** Screen y of the horizon (matches the sky art). */
  horizonY: number;
  /** Half-width of the paved road in world units. */
  roadWidth: number;
  segmentLength: number;
  rumbleLength: number;
  lanes: number;
  fieldOfView: number;
  cameraHeight: number;
  drawDistance: number;
  fogDensity: number;
}

/** Dynamic camera state supplied each frame. */
export interface CameraState {
  /** Distance along the track in world units. */
  position: number;
  /** Lateral player position: -1 = left road edge, +1 = right road edge. */
  playerX: number;
}
