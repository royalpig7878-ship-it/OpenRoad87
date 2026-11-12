import Phaser from 'phaser';
import { RoadSegment } from '../road/RoadTypes';
import { SceneryArt } from '../road/environments/EnvironmentTypes';
import { UNITS_PER_METRE_DRIVEN } from './ArcadeSession';

export type GateKind = 'gate_checkpoint' | 'gate_finish';

/** Scale metadata for the gate textures (about 21 m wide so its posts stand beside the shoulders). */
export const GATE_ART: Record<GateKind, SceneryArt> = {
  gate_checkpoint: { w: 256, h: 96, pxPerMetre: 12 },
  gate_finish: { w: 256, h: 96, pxPerMetre: 12 },
};

/** Draws the checkpoint and finish gates into canvas textures (posts, a banner, lights). Safe to call twice. */
export function createGateTextures(scene: Phaser.Scene): void {
  for (const kind of ['gate_checkpoint', 'gate_finish'] as GateKind[]) {
    if (scene.textures.exists(kind)) continue;
    const tex = scene.textures.createCanvas(kind, 256, 96)!;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    // Posts.
    for (const x of [0, 246]) {
      ctx.fillStyle = '#2a2d3a';
      ctx.fillRect(x, 0, 10, 96);
      ctx.fillStyle = '#5a5f74';
      ctx.fillRect(x + 1, 0, 3, 96);
    }
    // Banner.
    ctx.fillStyle = '#14141c';
    ctx.fillRect(10, 2, 236, 40);
    if (kind === 'gate_finish') {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 28; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#f4f0e6' : '#08080c';
        ctx.fillRect(12 + x * 8, 4 + y * 9, 8, 9);
      }
    } else {
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(12, 4, 232, 36);
      ctx.fillStyle = '#08080c';
      for (let x = 0; x < 232; x += 24) ctx.fillRect(12 + x, 4, 8, 4); // hazard ticks along the top edge
      ctx.fillStyle = '#08080c';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CHECKPOINT', 128, 24);
      // Snap every banner pixel to either black or yellow (no anti-aliased grey edges).
      const banner = ctx.getImageData(12, 4, 232, 36);
      for (let i = 0; i < banner.data.length; i += 4) {
        const lum = banner.data[i] * 0.3 + banner.data[i + 1] * 0.59 + banner.data[i + 2] * 0.11;
        const dark = lum < 130;
        banner.data[i] = dark ? 8 : 255;
        banner.data[i + 1] = dark ? 8 : 210;
        banner.data[i + 2] = dark ? 12 : 63;
        banner.data[i + 3] = 255;
      }
      ctx.putImageData(banner, 12, 4);
    }
    // Amber lights along the top of the banner.
    ctx.fillStyle = '#ff9a2a';
    for (let x = 18; x < 240; x += 14) ctx.fillRect(x, 0, 4, 3);
    tex.refresh();
  }
}

/** Put the gate for `distanceM` (metres driven from the start) on the road, removing any previous gate. */
export function placeGate(segments: RoadSegment[], startPosition: number, segmentLength: number, distanceM: number, kind: GateKind): number {
  clearGates(segments);
  const units = startPosition + distanceM * UNITS_PER_METRE_DRIVEN;
  const index = Math.floor(units / segmentLength) % segments.length;
  segments[index].scenery.push({ texture: kind, x: 0, scale: 1 });
  return index;
}

export function clearGates(segments: RoadSegment[]): void {
  for (const seg of segments) {
    if (seg.scenery.some((s) => s.texture === 'gate_checkpoint' || s.texture === 'gate_finish')) {
      seg.scenery = seg.scenery.filter((s) => s.texture !== 'gate_checkpoint' && s.texture !== 'gate_finish');
    }
  }
}
