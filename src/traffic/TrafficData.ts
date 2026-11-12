/** World units per metre. A 3-lane road is 4000 units wide = 10.5 m, so one lane is ~3.5 m. */
export const UNITS_PER_METRE = 381;
export const PLAYER_LENGTH_M = 4.4;
export const PLAYER_WIDTH_M = 1.8;

/** Static description of one kind of traffic vehicle. */
export interface TrafficType {
  id: string;
  name: string;
  /** Texture key of the straight-on rear view (the traffic drives away from the player). */
  texture: string;
  widthM: number;
  lengthM: number;
  /** Cruising speed range in km/h. */
  minKph: number;
  maxKph: number;
  /** Relative spawn likelihood. */
  weight: number;
  /** Colour used for the rear-view mirror silhouette. */
  mirrorColor: number;
}

/** Dimensions mirror traffic/traffic.json (the art's real-world sizes). */
export const TRAFFIC_TYPES: TrafficType[] = [
  { id: 'sedan', name: 'Sedan', texture: 'traffic_sedan_back', widthM: 1.76, lengthM: 4.8, minKph: 80, maxKph: 125, weight: 30, mirrorColor: 0x3a58a0 },
  { id: 'sports_car', name: 'Sports Car', texture: 'traffic_sports_car_back', widthM: 1.68, lengthM: 4.2, minKph: 120, maxKph: 175, weight: 14, mirrorColor: 0xc02a2a },
  { id: 'station_wagon', name: 'Station Wagon', texture: 'traffic_station_wagon_back', widthM: 1.82, lengthM: 5.0, minKph: 75, maxKph: 115, weight: 18, mirrorColor: 0x5a7a4a },
  { id: 'delivery_van', name: 'Delivery Van', texture: 'traffic_delivery_van_back', widthM: 2.04, lengthM: 5.5, minKph: 70, maxKph: 105, weight: 16, mirrorColor: 0xd8d4c8 },
  { id: 'bus', name: 'Bus', texture: 'traffic_bus_back', widthM: 2.5, lengthM: 12, minKph: 60, maxKph: 90, weight: 8, mirrorColor: 0xe0a020 },
  { id: 'semi_truck', name: 'Semi Truck', texture: 'traffic_semi_truck_back', widthM: 2.5, lengthM: 15, minKph: 60, maxKph: 95, weight: 14, mirrorColor: 0x7a7a86 },
];

export const getTrafficType = (id: string): TrafficType => TRAFFIC_TYPES.find((t) => t.id === id) ?? TRAFFIC_TYPES[0];

/** How busy and aggressive the traffic is. */
export interface TrafficDifficulty {
  /** 1.0 = about 10 cars in the visible stretch of road. */
  density: number;
  /** Multiplier on every vehicle's cruising speed. */
  speedMult: number;
  /** Chance per second that a free car makes a spontaneous lane change. */
  laneChangeChance: number;
}

export const DIFFICULTY = {
  easy: { density: 0.55, speedMult: 0.9, laneChangeChance: 0.01 },
  normal: { density: 1.0, speedMult: 1.0, laneChangeChance: 0.04 },
  hard: { density: 1.5, speedMult: 1.1, laneChangeChance: 0.09 },
  extreme: { density: 2.0, speedMult: 1.2, laneChangeChance: 0.16 },
} satisfies Record<string, TrafficDifficulty>;

export type DifficultyName = keyof typeof DIFFICULTY;

/** Smoothly scales difficulty with career progression: level 0 = easy .. 3 = extreme (fractions allowed). */
export function difficultyForLevel(level: number): TrafficDifficulty {
  const order: TrafficDifficulty[] = [DIFFICULTY.easy, DIFFICULTY.normal, DIFFICULTY.hard, DIFFICULTY.extreme];
  const l = Math.min(order.length - 1, Math.max(0, level));
  const i = Math.floor(l);
  const j = Math.min(order.length - 1, i + 1);
  const t = l - i;
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    density: mix(order[i].density, order[j].density),
    speedMult: mix(order[i].speedMult, order[j].speedMult),
    laneChangeChance: mix(order[i].laneChangeChance, order[j].laneChangeChance),
  };
}
