// Headless checks of environments, scenery placement and zone transitions. Run: npm run sim:world
import { readFileSync } from 'node:fs';
import { ENVIRONMENTS, allSceneryTextures } from '../src/road/environments/Environments';
import { SceneryArt } from '../src/road/environments/EnvironmentTypes';
import { TRANSITION_SEGMENTS, applyPalettes, blendAt, buildWorld } from '../src/road/environments/WorldBuilder';
import { minLateral } from '../src/road/environments/SceneryPlacer';
import { DEFAULT_ROAD_CONFIG } from '../src/road/TestTrack';
import { lerpWeather, weatherForTime } from '../src/road/WeatherRenderer';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};

// Same scale metadata the game loads at runtime.
const meta = JSON.parse(readFileSync('public/assets/scenery/scenery.json', 'utf8')) as { assets: Record<string, { w: number; h: number; pxPerMetre: number | null }> };
const art: Record<string, SceneryArt> = {};
for (const [k, a] of Object.entries(meta.assets)) if (a.pxPerMetre) art[k] = { w: a.w, h: a.h, pxPerMetre: a.pxPerMetre };
const cfg = DEFAULT_ROAD_CONFIG;

console.log('--- assets referenced by environments exist ---');
{
  const missingMeta = allSceneryTextures().filter((k) => !art[k]);
  check('every scenery texture has scale metadata', missingMeta.length === 0, missingMeta.join(','));
  const missingFiles: string[] = [];
  for (const k of allSceneryTextures()) {
    const folder = k.startsWith('road_') || k.startsWith('sign_') ? 'roads' : 'scenery';
    try { readFileSync(`public/assets/${folder}/${k}.png`); } catch { missingFiles.push(k); }
  }
  check('every scenery texture file exists', missingFiles.length === 0, missingFiles.join(','));
  const bd: string[] = [];
  for (const e of ENVIRONMENTS) for (const l of e.backdrop.layers) {
    for (const t of l.key.includes('{t}') ? ['day', 'sunset', 'night', 'storm'] : ['']) {
      const key = l.key.replace('{t}', t);
      try { readFileSync(`public/assets/scenery/${key}.png`); } catch { bd.push(key); }
    }
  }
  check('every backdrop layer file exists', bd.length === 0, bd.join(','));
}

console.log('--- each environment on its own ---');
for (const env of ENVIRONMENTS) {
  const w = buildWorld(cfg, [env], art);
  const last = w.segments[w.segments.length - 1];
  const items = w.segments.reduce((n, s) => n + s.scenery.length, 0);
  check(`${env.name}: builds a road`, w.segments.length > 300, `(${w.segments.length} segments)`);
  check(`${env.name}: road ends at height 0 (chains cleanly)`, Math.abs(last.p2.world.y) < 1, `(y=${last.p2.world.y.toFixed(1)})`);
  check(`${env.name}: has scenery`, items > w.segments.length * 0.15, `(${items} objects, ${(items / w.segments.length).toFixed(2)} per segment)`);
  const onRoad = w.segments.flatMap((s) => s.scenery).filter((it) => it.texture !== 'road_bridge' && Math.abs(it.x) < 1.7); // overpasses span the road on purpose
  check(`${env.name}: nothing placed on the road`, onRoad.length === 0, `(${onRoad.length} too close)`);
  const wide = w.segments.flatMap((s) => s.scenery).filter((it) => it.texture !== 'road_bridge' && Math.abs(it.x) < minLateral(art[it.texture], it.scale, cfg) - 1e-6);
  check(`${env.name}: wide objects kept clear of the road`, wide.length === 0);
}

console.log('--- scenery determinism and limits ---');
{
  const a = buildWorld(cfg, ENVIRONMENTS, art, 5);
  const b = buildWorld(cfg, ENVIRONMENTS, art, 5);
  const c = buildWorld(cfg, ENVIRONMENTS, art, 6);
  const sig = (w: typeof a) => w.segments.map((s) => s.scenery.map((i) => `${i.texture}@${i.x.toFixed(2)}`).join(',')).join('|');
  check('same seed gives identical scenery', sig(a) === sig(b));
  check('different seed gives different scenery', sig(a) !== sig(c));
  const maxPer = Math.max(...a.segments.map((s) => s.scenery.length));
  check('no segment is overcrowded', maxPer <= 8, `(max ${maxPer} per segment)`);
}

console.log('--- journey: zones and transitions ---');
{
  const w = buildWorld(cfg, ENVIRONMENTS, art);
  check('one zone per environment, contiguous', w.zones.length === ENVIRONMENTS.length && w.zones.every((z, i) => z.start === (i === 0 ? 0 : w.zones[i - 1].end)) && w.zones[w.zones.length - 1].end === w.segments.length);
  check('every segment knows its zone', w.segments.every((s, i) => i >= w.zones[s.zone].start && i < w.zones[s.zone].end));
  // Height continuity across the whole journey (no cliffs at boundaries).
  let maxJump = 0;
  for (let i = 1; i < w.segments.length; i++) maxJump = Math.max(maxJump, Math.abs(w.segments[i].p1.world.y - w.segments[i - 1].p2.world.y));
  check('road height is continuous across boundaries', maxJump < 1, `(max jump ${maxJump.toFixed(2)})`);

  const b1 = w.zones[1].start; // boundary between zone 0 and 1
  const before = blendAt(w, b1 - 1);
  const after = blendAt(w, b1);
  check('blend is ~50/50 at the boundary from both sides', Math.abs(before.t - 0.5) < 0.02 && Math.abs(after.t - 0.5) < 0.02 && before.neighbour === 1 && after.neighbour === 0, `(${before.t.toFixed(2)} / ${after.t.toFixed(2)})`);
  const mid = blendAt(w, Math.floor((w.zones[1].start + w.zones[1].end) / 2));
  check('no blending in the middle of a zone', mid.t === 0);
  const edge = blendAt(w, b1 + TRANSITION_SEGMENTS);
  check('blend fades to zero away from the boundary', edge.t === 0 && blendAt(w, b1 + Math.floor(TRANSITION_SEGMENTS / 2)).t > 0.1);

  applyPalettes(w, (e) => e.defaultTime);
  check('every segment gets a palette', w.segments.every((s) => !!s.palette));
  const distinct = new Set(w.segments.map((s) => s.palette)).size;
  check('palette objects are shared (not one per segment)', distinct < 200, `(${distinct} distinct)`);
  const pa = w.segments[b1 - 1].palette!.road[0], pb = w.segments[b1].palette!.road[0];
  check('colours at the boundary match across it (smooth)', Math.abs(((pa >> 16) & 255) - ((pb >> 16) & 255)) < 20);
  const mountainRoad = w.segments[w.zones[0].start + 100].palette!.road[0];
  const desertRoad = w.segments[w.zones[1].start + 150].palette!.road[0];
  check('different zones have different colours', mountainRoad !== desertRoad);

  // Scenery density fades near boundaries and recovers inside zones.
  const density = (from: number, to: number) => w.segments.slice(from, to).reduce((n, s) => n + s.scenery.length, 0) / (to - from);
  const nearBoundary = (density(b1 - 12, b1 + 12));
  const inside = density(w.zones[1].start + 150, w.zones[1].start + 250);
  check('scenery thins out at a boundary', nearBoundary < inside, `(${nearBoundary.toFixed(2)} at boundary vs ${inside.toFixed(2)} inside)`);

  // Night expressway keeps its own time unless overridden.
  const night = ENVIRONMENTS.find((e) => e.id === 'night')!;
  check('night levels (expressway, neon city) default to night, the rest to day', night.defaultTime === 'night' && ENVIRONMENTS.filter((e) => e.id !== 'night' && e.id !== 'neon').every((e) => e.defaultTime === 'day') && ENVIRONMENTS.find((e) => e.id === 'neon')!.defaultTime === 'night');
  applyPalettes(w, () => 'night');
  const dayRoad = mountainRoad;
  const nightRoad = w.segments[w.zones[0].start + 100].palette!.road[0];
  check('time of day override recolours the road', dayRoad !== nightRoad);
}

console.log('--- polish: bridges, one-sided barriers, weather ---');
{
  const w = buildWorld(cfg, ENVIRONMENTS, art);
  const bridges = w.segments.map((s, i) => ({ s, i })).filter(({ s }) => s.scenery.some((it) => it.texture === 'road_bridge'));
  check('overpasses exist', bridges.length >= 5, `(${bridges.length})`);
  check('overpasses stand on the centre line', bridges.every(({ s }) => s.scenery.filter((it) => it.texture === 'road_bridge').every((it) => it.x === 0)));
  const envsWithBridges = new Set(bridges.map(({ s }) => w.zones[s.zone].env.id));
  check('overpasses only in mountain, forest, countryside, night and neon', [...envsWithBridges].every((id) => ['mountain', 'forest', 'country', 'night', 'neon'].includes(id)) && envsWithBridges.size >= 3, [...envsWithBridges].join(','));

  const coastal = w.zones.find((z) => z.env.id === 'coastal')!;
  const coastSegs = w.segments.slice(coastal.start, coastal.end);
  check('coastal barriers are sea side (left) only', coastSegs.every((s) => s.barrierSide === -1));
  const other = w.segments.filter((s) => w.zones[s.zone].env.id !== 'coastal');
  check('other environments keep barriers on both sides', other.every((s) => s.barrierSide === 0));

  const storm = weatherForTime('storm'), day = weatherForTime('day');
  check('storms bring rain and fog, other times none', storm.rain === 1 && storm.fog > 0 && day.rain === 0 && day.fog === 0);
  const mid = lerpWeather(day, storm, 0.5);
  check('weather blends across a boundary', Math.abs(mid.rain - 0.5) < 1e-9);
}

console.log(failures === 0 ? '\nALL WORLD CHECKS PASSED' : `\n${failures} WORLD CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
