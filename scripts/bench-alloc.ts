// Allocation benchmark: how much memory the per-frame game code allocates (lower is better; ~0 = no garbage for the GC).
// Run: npm run bench   (needs a big young generation so that heap growth equals bytes allocated; the npm script sets it)
import { readFileSync } from 'node:fs';
import { ENVIRONMENTS } from '../src/road/environments/Environments';
import { SceneryArt } from '../src/road/environments/EnvironmentTypes';
import { applyPalettes, buildWorld } from '../src/road/environments/WorldBuilder';
import { DEFAULT_ROAD_CONFIG } from '../src/road/TestTrack';
import { RoadRenderer } from '../src/road/RoadRenderer';
import { TrafficManager, PlayerSample } from '../src/traffic/TrafficManager';
import { DIFFICULTY } from '../src/traffic/TrafficData';
import { PoliceManager } from '../src/police/PoliceManager';
import { WORLD_UNITS_PER_KPH } from '../src/systems/DrivingModel';
import { buildDriveFrame } from '../src/audio/driveFrame';
import { mixTargets, engineTargets, ENGINE_PROFILES } from '../src/audio/audioMath';

const meta = JSON.parse(readFileSync('public/assets/scenery/scenery.json', 'utf8')) as { assets: Record<string, { w: number; h: number; pxPerMetre: number | null }> };
const art: Record<string, SceneryArt> = {};
for (const [k, a] of Object.entries(meta.assets)) if (a.pxPerMetre) art[k] = { w: a.w, h: a.h, pxPerMetre: a.pxPerMetre };
const cfg = DEFAULT_ROAD_CONFIG;
const world = buildWorld(cfg, ENVIRONMENTS, art);
applyPalettes(world, (env) => env.defaultTime);

/** A stand-in for Phaser's Graphics: accepts every drawing call and keeps nothing. */
class NullGfx {
  calls = 0;
  clear() { this.calls++; }
  fillStyle() { this.calls++; }
  fillRect() { this.calls++; }
  fillTriangle() { this.calls++; }
}
const gfx = new NullGfx();
const road = new RoadRenderer(gfx as never, world.segments, cfg, ENVIRONMENTS[0].palette);
const TRACK = road.trackLength;

const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) {
  console.error('Run with --expose-gc (use: npm run bench)');
  process.exit(2);
}

/** Bytes allocated per call of `fn`, averaged over `n` calls (young generation is huge, so no collection happens during the loop). */
function bytesPerCall(fn: (i: number) => void, n = 3000): number {
  for (let i = 0; i < 200; i++) fn(i); // warm up the JIT
  gc!();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < n; i++) fn(i);
  const after = process.memoryUsage().heapUsed;
  return (after - before) / n;
}

const results: [string, number][] = [];
const cam = { position: 0, playerX: 0 };
results.push(['road.render (300 segments)', bytesPerCall((i) => {
  cam.position = (i * 140 * WORLD_UNITS_PER_KPH / 60) % TRACK;
  cam.playerX = Math.sin(i / 50) * 0.6;
  road.render(cam);
})]);

const traffic = new TrafficManager({ trackLength: TRACK, lanes: 3, segmentLength: 200, drawDistance: 300, seed: 3, difficulty: DIFFICULTY.hard, poolSize: 40 });
const police = new PoliceManager({ trackLength: TRACK, lanes: 3, segmentLength: 200, drawDistance: 300, seed: 5, level: 3 });
police.setSpeedLimit(100);
const player: PlayerSample = { position: 0, playerX: 0, speedKph: 160 };
results.push(['traffic.update', bytesPerCall(() => {
  player.position = (player.position + 160 * WORLD_UNITS_PER_KPH / 60) % TRACK;
  traffic.update(1 / 60, player);
})]);
police.startPursuit({ position: player.position, playerX: 0, speedKph: 160 });
results.push(['police.update (pursuit)', bytesPerCall(() => {
  player.position = (player.position + 160 * WORLD_UNITS_PER_KPH / 60) % TRACK;
  police.update(1 / 60, player, { trafficHits: 0, barrierHits: 0, nearMisses: 0 });
})]);
results.push(['police.rearView', bytesPerCall(() => void police.rearView(player, 1e9))]);

const frameIn = { speedKph: 150, position: 5000, playerX: 0, rpm: 4000, throttle: 1, brake: 0, skidding: false, surface: 'road' as const, shifting: false, damage: 0, fuel: 20, topSpeedKph: 250, idleRpm: 900, redlineRpm: 7000, trackLength: TRACK, unitsPerMetre: 381, rain: 0, traffic: traffic.cars, police: police.units };
results.push(['audio: buildDriveFrame + mix', bytesPerCall(() => {
  const f = buildDriveFrame(frameIn);
  mixTargets(f);
  engineTargets(ENGINE_PROFILES.engine_v8, f.rpm, 900, 7000, 1, false);
})]);

console.log('Allocated per call (average of 3000 calls):');
for (const [name, b] of results) console.log(`  ${name.padEnd(34)} ${(b / 1024).toFixed(2).padStart(8)} KB`);
// Draw calls per frame at each quality level (fewer = cheaper on phones).
console.log('Graphics calls per road frame by quality (300/230/170 segments):');
for (const [name, lod, dist] of [['high', 1, 300], ['medium', 1.8, 230], ['low', 3, 170]] as const) {
  road.lod = lod;
  road.setDrawDistance(dist);
  gfx.calls = 0;
  for (let i = 0; i < 500; i++) {
    cam.position = (i * 140 * WORLD_UNITS_PER_KPH / 60) % TRACK;
    cam.playerX = Math.sin(i / 50) * 0.6;
    road.render(cam);
  }
  console.log('  ' + name.padEnd(8) + (gfx.calls / 500).toFixed(0).padStart(6) + ' calls');
}
