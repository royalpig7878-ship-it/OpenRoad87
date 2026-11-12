import { MountainDay } from '../RoadPalettes';
import { RoadPalette } from '../RoadTypes';
import { Curve } from '../TrackBuilder';
import { mountainSections } from '../TestTrack';
import { Environment } from './EnvironmentTypes';

// Each environment is plain data: a palette, a road layout, scenery rules and a backdrop.
// Roads end with `close()` so every environment returns to height 0 and they can be chained.

const DesertDay: RoadPalette = {
  road: [0x6c6762, 0x645f5a],
  grass: [0xdcaa60, 0xd2a056],
  rumble: [0xece0c4, 0xb4583c],
  shoulder: [0xb89c78, 0xac9070],
  lane: 0xf4ead0,
  edgeLine: 0xf4ead0,
  barrier: [0xb8b4ac, 0x9c9890],
  barrierTop: 0xe8e4dc,
  fog: 0xf2dcb4,
};

const CoastalDay: RoadPalette = {
  road: [0x686b72, 0x60636a],
  grass: [0xe8d49c, 0xdec890], // beach sand on the land side
  groundLeft: [0x2c6eae, 0x2664a6], // the sea
  rumble: [0xf0f0f0, 0xc84a3a],
  shoulder: [0xbab2a2, 0xaea696],
  lane: 0xf6f2e0,
  edgeLine: 0xf6f2e0,
  barrier: [0xc4c8d0, 0xa0a6b0],
  barrierTop: 0xf0f4f8,
  fog: 0xbcdaf0,
};

const ForestDay: RoadPalette = {
  road: [0x54565c, 0x4d4f56],
  grass: [0x2f6c3a, 0x286230],
  rumble: [0xc8c8b8, 0x9c3c32],
  shoulder: [0x7a7468, 0x70695e],
  lane: 0xe8e4d0,
  edgeLine: 0xe8e4d0,
  barrier: [0x9a9e98, 0x848880],
  barrierTop: 0xc8ccc4,
  fog: 0x9cb8a6,
};

const CountryDay: RoadPalette = {
  road: [0x5c5f66, 0x555860],
  grass: [0x8eba5c, 0x82ae52],
  rumble: [0xe2decd, 0xc24c3c],
  shoulder: [0x968f82, 0x8c8578],
  lane: 0xf2eedc,
  edgeLine: 0xf2eedc,
  barrier: [0xb0b4ac, 0x969a92],
  barrierTop: 0xdcdcd4,
  fog: 0xcadcca,
};

const NightExpresswayDay: RoadPalette = {
  road: [0x363840, 0x30323a],
  grass: [0x16321e, 0x122a19],
  rumble: [0x8c8c9a, 0x8a3a46],
  shoulder: [0x424250, 0x3a3a46],
  lane: 0xe8e0a0,
  edgeLine: 0xe8e0a0,
  barrier: [0x8c8e96, 0x787a84],
  barrierTop: 0xb4b6be,
  fog: 0x141c3c,
};

export const MOUNTAIN_PASS: Environment = {
  id: 'mountain',
  speedLimitMph: 65,
  name: 'Mountain Pass',
  palette: MountainDay,
  defaultTime: 'day',
  buildTrack: mountainSections,
  scenery: [
    { textures: ['scenery_pine_tree', 'scenery_pine_tree', 'scenery_pine_tree_small'], spacing: [2, 6], lateral: [2.0, 6], scale: [0.8, 1.3] },
    { textures: ['scenery_rock_large', 'scenery_rock_small', 'scenery_rock_small'], spacing: [8, 24], lateral: [1.8, 4.5], scale: [0.8, 1.4] },
    { textures: ['scenery_grass_tuft'], spacing: [2, 5], lateral: [1.85, 3.5], scale: [0.8, 1.4] },
    { textures: ['scenery_wildflowers'], spacing: [5, 16], lateral: [1.9, 4], scale: [0.9, 1.4] },
    { textures: ['scenery_log'], spacing: [40, 90], lateral: [2.2, 6], scale: [0.9, 1.3] },
    { textures: ['road_bridge'], spacing: [330, 560], lateral: [0, 0], center: true },
  ],
  backdrop: {
    layers: [
      { key: 'sky_{t}_layer_sky', parallax: 0.02 },
      { key: 'sky_{t}_layer_far', parallax: 0.08 },
      { key: 'sky_{t}_layer_near', parallax: 0.2 },
    ],
  },
  signs: { curve: 'sign_warning_curve', speed: ['sign_speed_limit_65', 'sign_warning_mountain_pass'] },
};

export const DESERT_HIGHWAY: Environment = {
  id: 'desert',
  speedLimitMph: 75,
  name: 'Desert Highway',
  palette: DesertDay,
  defaultTime: 'day',
  buildTrack: (t) => {
    t.straight(40)
      .curve(60, Curve.Easy, 0, false)
      .straight(30)
      .hill(90, 3)
      .curve(80, -Curve.Easy, 0, false)
      .straight(40)
      .slope(100, 5, 0, false)
      .curve(70, Curve.Medium, 0, false)
      .slope(100, -5, 0, false)
      .straight(30)
      .curve(60, -Curve.Easy, 0, false)
      .close(40);
  },
  scenery: [
    { textures: ['desert_cactus_large', 'desert_cactus_small', 'desert_cactus_small'], spacing: [8, 26], lateral: [2.0, 7], scale: [0.8, 1.2] },
    { textures: ['desert_bush'], spacing: [4, 12], lateral: [1.8, 5], scale: [0.8, 1.3] },
    { textures: ['desert_rock'], spacing: [30, 80], lateral: [2.5, 8], scale: [0.7, 1.3] },
    { textures: ['desert_rock_small'], spacing: [10, 28], lateral: [1.9, 6], scale: [0.7, 1.3] },
    { textures: ['desert_dry_grass'], spacing: [4, 10], lateral: [1.85, 4], scale: [0.8, 1.4] },
    { textures: ['desert_tumbleweed'], spacing: [14, 40], lateral: [1.9, 5], scale: [0.8, 1.3] },
    { textures: ['desert_joshua_tree'], spacing: [26, 60], lateral: [2.5, 9], scale: [0.8, 1.3] },
    { textures: ['desert_billboard'], spacing: [140, 260], lateral: [2.4, 3.2], side: 1 },
    { textures: ['desert_gas_station'], spacing: [420, 700], lateral: [4.5, 5.5], side: 1 },
  ],
  backdrop: {
    layers: [
      { key: 'sky_{t}_layer_sky', parallax: 0.02 },
      { key: 'desert_mesa', parallax: 0.1, bottomAtHorizon: true, tintByTime: true },
    ],
  },
  signs: { curve: 'sign_warning_curve', speed: ['sign_speed_limit_75', 'sign_fuel'] },
};

export const COASTAL_HIGHWAY: Environment = {
  id: 'coastal',
  speedLimitMph: 55,
  name: 'Coastal Highway',
  palette: CoastalDay,
  defaultTime: 'day',
  buildTrack: (t) => {
    const from = t.segments.length;
    t.curve(90, Curve.Easy)
      .curve(70, -Curve.Medium)
      .hill(80, 3)
      .curve(100, Curve.Medium)
      .straight(15)
      .curve(90, -Curve.Easy)
      .slope(80, -5, 0, true)
      .curve(60, Curve.Hard)
      .slope(80, 5, 0, true)
      .curve(70, -Curve.Easy)
      .close(40);
    t.restrictBarriers(from, -1); // the sea is on the left
  },
  scenery: [
    { textures: ['coastal_palm_tree'], spacing: [3, 8], lateral: [1.9, 2.6], scale: [0.8, 1.2], side: 1 },
    { textures: ['coastal_cliff'], spacing: [10, 28], lateral: [3, 7], side: 1 },
    { textures: ['coastal_lighthouse'], spacing: [300, 520], lateral: [3.5, 6], side: -1 },
    { textures: ['coastal_dune_grass'], spacing: [3, 8], lateral: [1.85, 3.5], scale: [0.8, 1.4] },
    { textures: ['coastal_beach_umbrella'], spacing: [70, 150], lateral: [2.4, 4], side: -1 },
    { textures: ['coastal_beach_rocks'], spacing: [14, 36], lateral: [2, 5], side: -1 },
  ],
  backdrop: {
    layers: [
      { key: 'sky_{t}_layer_sky', parallax: 0.02 },
      { key: 'sky_{t}_layer_far', parallax: 0.06 },
    ],
  },
  signs: { curve: 'coastal_road_sign', speed: ['sign_speed_limit', 'sign_rest_area'] },
};

export const FOREST_HIGHWAY: Environment = {
  id: 'forest',
  speedLimitMph: 65,
  name: 'Forest Highway',
  palette: ForestDay,
  defaultTime: 'day',
  buildTrack: (t) => {
    t.curve(50, Curve.Easy)
      .curve(50, -Curve.Medium)
      .curve(40, Curve.Hard)
      .straight(10)
      .curve(60, -Curve.Easy)
      .hill(70, 4)
      .curve(50, Curve.Medium)
      .curve(50, -Curve.Medium)
      .slope(70, 6, -Curve.Easy)
      .curve(60, Curve.Easy)
      .slope(70, -6, 0)
      .curve(50, -Curve.Hard)
      .close(40);
  },
  scenery: [
    { textures: ['forest_pine_cluster', 'forest_deciduous_tree', 'forest_deciduous_tree'], spacing: [2, 6], lateral: [2.0, 7], scale: [0.8, 1.3] },
    { textures: ['forest_bush'], spacing: [3, 9], lateral: [1.8, 3.5], scale: [0.8, 1.4] },
    { textures: ['forest_fern'], spacing: [2, 5], lateral: [1.85, 4], scale: [0.8, 1.4] },
    { textures: ['forest_stump'], spacing: [24, 60], lateral: [2, 6], scale: [0.9, 1.3] },
    { textures: ['scenery_log'], spacing: [40, 90], lateral: [2.2, 6], scale: [0.9, 1.3] },
    { textures: ['scenery_wildflowers'], spacing: [10, 28], lateral: [1.9, 4], scale: [0.9, 1.3] },
    { textures: ['forest_wooden_fence'], spacing: [15, 16], lateral: [1.85, 1.9], scale: [1, 1] },
    { textures: ['road_bridge'], spacing: [300, 520], lateral: [0, 0], center: true },
  ],
  backdrop: {
    layers: [
      { key: 'sky_{t}_layer_sky', parallax: 0.02 },
      { key: 'sky_{t}_layer_near', parallax: 0.2 },
    ],
  },
  signs: { curve: 'sign_warning_curve', speed: ['sign_speed_limit_65', 'sign_warning_grade'] },
};

export const COUNTRYSIDE: Environment = {
  id: 'country',
  speedLimitMph: 55,
  name: 'Countryside',
  palette: CountryDay,
  defaultTime: 'day',
  buildTrack: (t) => {
    t.hill(120, 4)
      .curve(120, Curve.Easy)
      .straight(40)
      .hill(100, 5)
      .curve(100, -Curve.Easy)
      .straight(40)
      .slope(90, 4, Curve.Easy)
      .slope(90, -4, -Curve.Easy)
      .close(40);
  },
  scenery: [
    { textures: ['country_barn', 'country_farmhouse'], spacing: [60, 160], lateral: [4.5, 8], scale: [0.9, 1.1] },
    { textures: ['country_windmill'], spacing: [160, 320], lateral: [3, 8], side: -1 },
    { textures: ['country_wheat'], spacing: [2, 6], lateral: [1.85, 6], scale: [0.9, 1.5] },
    { textures: ['country_corn'], spacing: [3, 9], lateral: [3, 9], side: 1, scale: [0.9, 1.3] },
    { textures: ['country_haybale'], spacing: [14, 40], lateral: [2.2, 8], scale: [0.9, 1.3] },
    { textures: ['country_mailbox'], spacing: [60, 130], lateral: [1.9, 2.2], side: 1 },
    { textures: ['country_telephone_pole'], spacing: [9, 10], lateral: [1.75, 1.8], side: 1, scale: [1, 1] },
    { textures: ['forest_deciduous_tree'], spacing: [8, 28], lateral: [2.5, 9], scale: [0.8, 1.2] },
    { textures: ['forest_wooden_fence'], spacing: [15, 16], lateral: [1.85, 1.9], scale: [1, 1], side: -1 },
    { textures: ['road_bridge'], spacing: [420, 700], lateral: [0, 0], center: true },
  ],
  backdrop: {
    layers: [
      { key: 'sky_{t}_layer_sky', parallax: 0.02 },
      { key: 'sky_{t}_layer_near', parallax: 0.15 },
    ],
  },
  signs: { curve: 'sign_warning_curve', speed: ['sign_speed_limit', 'sign_exit'] },
};

export const NIGHT_EXPRESSWAY: Environment = {
  id: 'night',
  speedLimitMph: 75,
  name: 'Night Expressway',
  palette: NightExpresswayDay,
  defaultTime: 'night',
  buildTrack: (t) => {
    t.straight(40)
      .curve(150, Curve.Easy, 0, true)
      .straight(40)
      .curve(140, -Curve.Easy, 0, true)
      .hill(120, 3)
      .straight(40)
      .curve(100, Curve.Medium, 0, true)
      .close(40);
  },
  scenery: [
    { textures: ['road_lamppost'], spacing: [8, 8], lateral: [1.78, 1.82], scale: [1, 1] },
    { textures: ['scenery_pine_tree_small', 'scenery_pine_tree'], spacing: [10, 30], lateral: [4, 9], scale: [0.8, 1.2] },
    { textures: ['road_toll_booth'], spacing: [500, 800], lateral: [2.4, 2.6], side: 1 },
    { textures: ['night_building', 'night_warehouse'], spacing: [14, 36], lateral: [3.5, 10], scale: [0.9, 1.3] },
    { textures: ['night_billboard'], spacing: [180, 320], lateral: [3, 4], side: -1 },
    { textures: ['forest_bush'], spacing: [5, 14], lateral: [1.9, 4], scale: [0.8, 1.3] },
    { textures: ['road_bridge'], spacing: [160, 300], lateral: [0, 0], center: true },
  ],
  backdrop: {
    layers: [
      { key: 'sky_{t}_layer_sky', parallax: 0.02 },
      { key: 'sky_{t}_layer_far', parallax: 0.08 },
      { key: 'sky_{t}_layer_near', parallax: 0.2 },
    ],
  },
  signs: { curve: 'sign_warning_curve', speed: ['sign_speed_limit_75', 'sign_exit'] },
};

const NeonCity: RoadPalette = {
  road: [0x1c1430, 0x181028],
  grass: [0x341058, 0x2a0c4a],
  rumble: [0xff2fa8, 0x20e8ff],
  shoulder: [0x32204c, 0x2a1a44],
  lane: 0x20e8ff,
  edgeLine: 0xff2fa8,
  barrier: [0x5a3a8a, 0x46286e],
  barrierTop: 0x20e8ff,
  fog: 0x6a1670,
};

export const NEON_CITY: Environment = {
  id: 'neon',
  speedLimitMph: 55,
  name: 'Neon City',
  palette: NeonCity,
  defaultTime: 'night',
  fixedLook: true,
  buildTrack: (t) => {
    t.straight(30)
      .curve(80, Curve.Easy)
      .hill(90, 3)
      .curve(100, -Curve.Medium)
      .straight(30)
      .curve(70, Curve.Hard)
      .hill(70, 2)
      .curve(90, -Curve.Easy)
      .close(40);
  },
  scenery: [
    { textures: ['synth_pylon_pink', 'synth_pylon_cyan'], spacing: [8, 8], lateral: [1.78, 1.82], scale: [1, 1] },
    { textures: ['synth_tower_pink', 'synth_tower_cyan'], spacing: [10, 24], lateral: [3.5, 12], scale: [0.9, 1.4] },
    { textures: ['synth_billboard'], spacing: [150, 260], lateral: [3, 4], side: -1 },
    { textures: ['synth_palm'], spacing: [12, 30], lateral: [3, 7], scale: [0.8, 1.2] },
    { textures: ['synth_crystals'], spacing: [4, 12], lateral: [1.9, 4], scale: [0.8, 1.4] },
    { textures: ['road_bridge'], spacing: [200, 360], lateral: [0, 0], center: true },
  ],
  backdrop: {
    layers: [
      { key: 'synth_layer_sky', parallax: 0.02 },
      { key: 'synth_wire_peaks', parallax: 0.06, bottomAtHorizon: true },
      { key: 'synth_skyline', parallax: 0.12, bottomAtHorizon: true },
    ],
  },
  signs: { curve: 'sign_warning_curve', speed: ['sign_speed_limit', 'sign_exit'] },
};

/** All environments in journey order (the order they are chained into one long road). */
export const ENVIRONMENTS: Environment[] = [MOUNTAIN_PASS, DESERT_HIGHWAY, COASTAL_HIGHWAY, FOREST_HIGHWAY, COUNTRYSIDE, NIGHT_EXPRESSWAY, NEON_CITY];

export const getEnvironment = (id: string): Environment => ENVIRONMENTS.find((e) => e.id === id) ?? MOUNTAIN_PASS;

/** The scenery texture keys that the given environments use. */
export function sceneryTexturesOf(envs: Environment[]): string[] {
  const keys = new Set<string>();
  for (const e of envs) for (const r of e.scenery) r.textures.forEach((k) => keys.add(k));
  return [...keys];
}

/** Every texture key the scenery system might draw (for preloading). */
export function allSceneryTextures(): string[] {
  const keys = new Set<string>();
  for (const e of ENVIRONMENTS) {
    for (const r of e.scenery) r.textures.forEach((k) => keys.add(k));
    if (e.signs) {
      keys.add(e.signs.curve);
      e.signs.speed.forEach((k) => keys.add(k));
    }
  }
  keys.add('road_mile_marker');
  return [...keys];
}
