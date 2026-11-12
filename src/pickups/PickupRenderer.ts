import Phaser from 'phaser';
import { RoadRenderer } from '../road/RoadRenderer';
import { RoadConfig } from '../road/RoadTypes';
import { UNITS_PER_METRE } from '../traffic/TrafficData';
import { Pickup, PickupKind } from './PickupManager';

// ---------------------------------------------------------------- art
// Each pickup is a round 24x24 pixel badge with a 12x12 glyph, generated at runtime (no image files needed).

const GLYPHS: Record<PickupKind, string[]> = {
  repair: [ // wrench
    '........##..',
    '.......###.#',
    '.......#####',
    '......#####.',
    '.....###....',
    '....###.....',
    '...###......',
    '..###.......',
    '.###........',
    '###.........',
    '##..........',
    '............',
  ],
  fuel: [ // jerry can
    '...###..##..',
    '...#.#.#..#.',
    '.##########.',
    '.##.####.##.',
    '.###.##.###.',
    '.####..####.',
    '.####..####.',
    '.###.##.###.',
    '.##.####.##.',
    '.##########.',
    '.##########.',
    '............',
  ],
  money: [ // dollar sign
    '.....#......',
    '...######...',
    '..##.#..##..',
    '..##.#......',
    '...####.....',
    '.....####...',
    '.....#..##..',
    '..##.#..##..',
    '...######...',
    '.....#......',
    '............',
    '............',
  ],
  boost: [ // lightning bolt
    '......####..',
    '.....####...',
    '....####....',
    '...####.....',
    '..#########.',
    '..########..',
    '.......##...',
    '......##....',
    '.....##.....',
    '....##......',
    '...##.......',
    '..#.........',
  ],
};

const COLORS: Record<PickupKind, { badge: number; glyph: number }> = {
  repair: { badge: 0x2fbf4f, glyph: 0xffffff },
  fuel: { badge: 0xd8302a, glyph: 0xffffff },
  money: { badge: 0xf2c230, glyph: 0x1e6a2a },
  boost: { badge: 0x2a6ae0, glyph: 0xffe040 },
};

export const pickupTexture = (k: PickupKind): string => `pickup_${k}`;
const SIZE = 24;
/** Badge size on the road, metres (wide enough to spot from a distance). */
const WIDTH_M = 1.6;
/** How high the badge floats above the road, metres. */
const FLOAT_M = 0.35;

const lighten = (c: number, f: number): number => {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) + (255 - ((c >> s) & 255)) * f));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Draws the four pickup badges into textures (once per game). */
export function ensurePickupTextures(scene: Phaser.Scene): void {
  for (const k of Object.keys(GLYPHS) as PickupKind[]) {
    const key = pickupTexture(k);
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, SIZE, SIZE)!;
    const ctx = tex.getContext();
    const { badge, glyph } = COLORS[k];
    const px = (x: number, y: number, c: number) => {
      ctx.fillStyle = css(c);
      ctx.fillRect(x, y, 1, 1);
    };
    const c0 = (SIZE - 1) / 2;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const d = Math.hypot(x - c0, y - c0);
        if (d > c0 + 0.3) continue;
        if (d > c0 - 1.4) px(x, y, 0x101018); // outline
        else if (d > c0 - 3 && x + y < SIZE - 4) px(x, y, lighten(badge, 0.45)); // rim highlight, top-left
        else px(x, y, badge);
      }
    }
    // Darker lower-right rim.
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const d = Math.hypot(x - c0, y - c0);
        if (d <= c0 - 1.4 && d > c0 - 3 && x + y > SIZE + 2) {
          const r = ((badge >> 16) & 255) * 0.7, g = ((badge >> 8) & 255) * 0.7, b = (badge & 255) * 0.7;
          px(x, y, (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b));
        }
      }
    }
    // Glyph with a 1px drop shadow.
    const rows = GLYPHS[k];
    for (const [ox, oy, col] of [[1, 1, 0x101018], [0, 0, glyph]] as const) {
      rows.forEach((row, gy) => {
        for (let gx = 0; gx < row.length; gx++) if (row[gx] === '#') px(6 + gx + ox, 6 + gy + oy, col);
      });
    }
    tex.refresh();
  }
}

// ---------------------------------------------------------------- drawing

/**
 * Draws pickups as spinning badges floating over their lane, projected like traffic (hidden by hill crests,
 * faded by fog). Pooled sprites.
 */
export class PickupRenderer {
  private sprites: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, private road: RoadRenderer, private cfg: RoadConfig, poolSize = 6, private baseDepth = 2) {
    ensurePickupTextures(scene);
    for (let i = 0; i < poolSize; i++) this.sprites.push(scene.add.image(0, 0, pickupTexture('money')).setVisible(false).setDepth(baseDepth));
  }

  update(items: Pickup[], cameraPosition: number, trackLength: number, jolt: number): void {
    let used = 0;
    for (const p of items) {
      if (used >= this.sprites.length) break;
      const ahead = (((p.z - cameraPosition) % trackLength) + trackLength) % trackLength;
      if (ahead <= 0 || ahead > trackLength / 2) continue;
      const proj = this.road.projectSprite(cameraPosition, ahead, p.x);
      if (!proj) continue;
      const pxPerMetre = ((proj.scale * this.cfg.width) / 2) * UNITS_PER_METRE;
      const k = (pxPerMetre * WIDTH_M) / SIZE; // continuous: snapped steps made pickups grow in jumps
      if (k < 0.08) continue;
      const spr = this.sprites[used++];
      const bob = Math.sin(p.age * 3) * 0.08;
      // Origin below the badge so it floats above the road surface.
      spr.setTexture(pickupTexture(p.kind));
      spr.setOrigin(0.5, 1 + (FLOAT_M + bob) / WIDTH_M);
      // A coin-style spin (never edge-on, so it stays readable).
      spr.setScale(k * (0.35 + 0.65 * Math.abs(Math.cos(p.age * 2.6))), k);
      spr.setPosition(Math.round(proj.x), Math.round(proj.y) + jolt);
      spr.setAlpha(1 - 0.9 * proj.fog * proj.fog);
      spr.setDepth(this.baseDepth + 1 - proj.segmentsAhead / this.road.drawDistance);
      // Hidden behind a nearer hill crest: skip rather than crop (it floats, so a partial crop looks odd).
      spr.setVisible(proj.y - (FLOAT_M / WIDTH_M) * SIZE * k <= proj.clipY + 1);
    }
    for (let i = used; i < this.sprites.length; i++) this.sprites[i].setVisible(false);
  }

  destroy(): void {
    this.sprites.forEach((s) => s.destroy());
    this.sprites = [];
  }
}
