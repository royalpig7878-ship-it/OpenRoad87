/** Player preferences. Stored by the save system (`SaveManager`). */
export interface GameSettings {
  /** How touch steering works: on-screen left/right buttons or a draggable virtual steering wheel. */
  steerMode: 'buttons' | 'wheel';
  /** Show touch controls: automatically on touch devices, always, or never. */
  touchControls: 'auto' | 'on' | 'off';
  /** Opacity of touch controls, 0.2 .. 0.9. */
  touchOpacity: number;
  /** Graphics quality: adaptive, or fixed. */
  quality: 'auto' | 'high' | 'medium' | 'low';
  /** Volumes 0..1 and a global mute switch. */
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  /** Screen scaling: 'even' keeps game pixels the same size at fractional scales (sharp bilinear); 'original' is plain nearest-neighbour. */
  pixelScaling: 'even' | 'original';
}

export const DEFAULT_SETTINGS: GameSettings = { steerMode: 'buttons', touchControls: 'auto', touchOpacity: 0.5, quality: 'auto', masterVolume: 0.8, musicVolume: 0.6, sfxVolume: 0.9, muted: false, pixelScaling: 'even' };

/** Reads settings defensively: anything missing or invalid falls back to its default. */
export function parseSettings(text: string | null | undefined): GameSettings {
  const out = { ...DEFAULT_SETTINGS };
  if (!text) return out;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return out;
  }
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (r.steerMode === 'buttons' || r.steerMode === 'wheel') out.steerMode = r.steerMode;
  if (r.touchControls === 'auto' || r.touchControls === 'on' || r.touchControls === 'off') out.touchControls = r.touchControls;
  if (typeof r.touchOpacity === 'number' && Number.isFinite(r.touchOpacity)) out.touchOpacity = Math.min(0.9, Math.max(0.2, r.touchOpacity));
  if (r.quality === 'auto' || r.quality === 'high' || r.quality === 'medium' || r.quality === 'low') out.quality = r.quality;
  const vol = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
  out.masterVolume = vol(r.masterVolume, out.masterVolume);
  out.musicVolume = vol(r.musicVolume, out.musicVolume);
  out.sfxVolume = vol(r.sfxVolume, out.sfxVolume);
  if (typeof r.muted === 'boolean') out.muted = r.muted;
  if (r.pixelScaling === 'even' || r.pixelScaling === 'original') out.pixelScaling = r.pixelScaling;
  return out;
}

let current: GameSettings = { ...DEFAULT_SETTINGS };
const listeners: Array<() => void> = [];

export const getSettings = (): GameSettings => current;

/** Replaces all settings at once (used when a save is loaded or imported). Does not notify save listeners. */
export function replaceSettings(raw: unknown): GameSettings {
  current = parseSettings(typeof raw === 'string' ? raw : JSON.stringify(raw ?? {}));
  return current;
}

/** Called after every change so the save system can store them. */
export const onSettingsChange = (fn: () => void): void => {
  listeners.push(fn);
};

/** Changes some settings (validated). Storage is handled by the save system via `onSettingsChange`. */
export function updateSettings(patch: Partial<GameSettings>): GameSettings {
  current = parseSettings(JSON.stringify({ ...current, ...patch }));
  for (const l of listeners) l();
  return current;
}
