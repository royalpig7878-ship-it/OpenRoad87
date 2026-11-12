import { Bindings, DEFAULT_BINDINGS, cloneBindings, parseBindings } from '../controls/Bindings';
import { PlayerProfile, createProfile, deserializeProfile } from '../economy/Profile';
import { DEFAULT_SETTINGS, GameSettings, parseSettings } from './Settings';

/**
 * The save file format. Pure (no storage, no browser): turns game state into text and back.
 *
 *   { "format": "openroad87", "version": 1, "savedAt": 1700000000000, "checksum": "a1b2c3d4", "data": { profile, settings, bindings } }
 *
 * - `version` lets old saves be upgraded (see MIGRATIONS) and warns us about saves from a newer game.
 * - `checksum` (FNV-1a of the data text) detects truncated or hand-edited files.
 * - Reading never throws: anything unreadable gives a safe default plus a list of what went wrong.
 */
export const SAVE_FORMAT = 'openroad87';
export const SAVE_VERSION = 1;

export interface SaveData {
  profile: PlayerProfile;
  settings: GameSettings;
  bindings: Bindings;
}

export const defaultSaveData = (): SaveData => ({ profile: createProfile(), settings: { ...DEFAULT_SETTINGS }, bindings: cloneBindings(DEFAULT_BINDINGS) });

/** What a read found. `ok` is a clean file, `repaired` was readable but not trustworthy, `invalid` is unusable. */
export type DecodeStatus = 'ok' | 'repaired' | 'invalid';
export type SaveIssue = 'empty' | 'unreadable' | 'wrong_format' | 'bad_checksum' | 'newer_version' | 'bad_version' | 'migrated' | 'migration_failed';

export interface DecodeResult {
  status: DecodeStatus;
  /** Always a complete, valid SaveData (defaults where the file had nothing usable). */
  data: SaveData;
  issues: SaveIssue[];
  /** Version the file was written with (null if unknown). */
  version: number | null;
  savedAt: number | null;
}

/** 32-bit FNV-1a hash as 8 hex digits. Not security: only catches accidents and sloppy edits. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Upgrades `data` from version N to N+1. Add one entry per format change; never edit old ones. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {};

export function encodeSave(data: SaveData, now = Date.now(), version = SAVE_VERSION): string {
  const body = JSON.stringify({ profile: data.profile, settings: data.settings, bindings: data.bindings });
  return `{"format":"${SAVE_FORMAT}","version":${version},"savedAt":${Math.floor(now)},"checksum":"${checksum(body)}","data":${body}}`;
}

/** Turns raw (already parsed) data into valid SaveData using each module's defensive parser. */
function sanitize(raw: unknown): SaveData {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    profile: deserializeProfile(JSON.stringify(r.profile ?? null)),
    settings: parseSettings(JSON.stringify(r.settings ?? null)),
    bindings: parseBindings(r.bindings),
  };
}

export function decodeSave(text: string | null | undefined, migrations: Record<number, Migration> = MIGRATIONS, currentVersion = SAVE_VERSION): DecodeResult {
  const fail = (issue: SaveIssue): DecodeResult => ({ status: 'invalid', data: defaultSaveData(), issues: [issue], version: null, savedAt: null });
  if (typeof text !== 'string' || text.trim() === '') return fail('empty');
  let env: unknown;
  try {
    env = JSON.parse(text);
  } catch {
    return fail('unreadable');
  }
  if (typeof env !== 'object' || env === null || Array.isArray(env)) return fail('unreadable');
  const e = env as Record<string, unknown>;
  if (e.format !== SAVE_FORMAT) return fail('wrong_format');
  if (typeof e.version !== 'number' || !Number.isInteger(e.version) || e.version < 1) return { ...fail('bad_version') };

  const issues: SaveIssue[] = [];
  let status: DecodeStatus = 'ok';
  const savedAt = typeof e.savedAt === 'number' && Number.isFinite(e.savedAt) ? e.savedAt : null;
  if (typeof e.data !== 'object' || e.data === null || Array.isArray(e.data)) return { ...fail('unreadable'), version: e.version };

  // Integrity: the checksum covers the exact data text, which we recompute from the parsed object.
  if (typeof e.checksum !== 'string' || e.checksum !== checksum(JSON.stringify(e.data))) {
    issues.push('bad_checksum');
    status = 'repaired';
  }

  let data = e.data as Record<string, unknown>;
  if (e.version > currentVersion) {
    // Saved by a newer game: read what we understand, but the caller should keep a copy before overwriting.
    issues.push('newer_version');
    status = 'repaired';
  } else {
    for (let v = e.version; v < currentVersion; v++) {
      const step = migrations[v];
      if (!step) {
        issues.push('migration_failed');
        status = 'repaired';
        break;
      }
      try {
        data = step(data);
      } catch {
        issues.push('migration_failed');
        status = 'repaired';
        break;
      }
    }
    if (e.version < currentVersion && !issues.includes('migration_failed')) issues.push('migrated');
  }
  return { status, data: sanitize(data), issues, version: e.version, savedAt };
}

/** Two saves hold the same game state (ignores when they were saved). */
export const sameData = (a: SaveData, b: SaveData): boolean => JSON.stringify(a) === JSON.stringify(b);
