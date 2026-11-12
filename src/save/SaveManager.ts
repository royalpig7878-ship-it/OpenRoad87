import { cloneBindings } from '../controls/Bindings';
import { getProfile, setProfile } from '../economy/currentProfile';
import { createProfile } from '../economy/Profile';
import { getBindings, onBindingsChange, setBindings } from './ControlPrefs';
import { SaveBackend, createDefaultBackend } from './SaveBackend';
import { SaveData, SaveIssue, decodeSave, defaultSaveData, encodeSave, sameData } from './SaveFile';
import { getSettings, onSettingsChange, parseSettings, replaceSettings } from './Settings';

/** Storage keys. The main save plus safety copies. */
export const KEYS = {
  main: 'openroad87.save',
  backup: 'openroad87.save.bak',
  corrupt: 'openroad87.save.corrupt',
  future: 'openroad87.save.future',
  /** Settings written by the Milestone 12/13 build, imported once if no save exists. */
  legacySettings: 'openroad87.settings.v1',
} as const;

export type LoadSource = 'main' | 'backup' | 'salvaged' | 'legacy' | 'fresh';

export interface LoadReport {
  source: LoadSource;
  issues: SaveIssue[];
  savedAt: number | null;
  /** A message worth showing the player (null when everything was normal). */
  notice: string | null;
}

export type ImportResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Loads and stores the game state: profile (money, reputation, cars, upgrades, damage, scores, career), settings and
 * control bindings. Safe against corrupt data: a damaged main save falls back to the previous good copy, the damaged
 * text is kept aside, and a failed write never destroys the existing save.
 */
export class SaveManager {
  lastReport: LoadReport = { source: 'fresh', issues: [], savedAt: null, notice: null };
  lastError: string | null = null;
  lastSavedAt: number | null = null;
  private lastSavedData: SaveData | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending = false;

  constructor(private backend: SaveBackend = createDefaultBackend(), private now: () => number = () => Date.now()) {}

  get backendName(): string {
    return this.backend.name;
  }

  /** The current game state, copied. */
  snapshot(): SaveData {
    return JSON.parse(JSON.stringify({ profile: getProfile(), settings: getSettings(), bindings: getBindings() }));
  }

  private apply(data: SaveData): void {
    setProfile(data.profile);
    replaceSettings(data.settings);
    setBindings(data.bindings);
    this.lastSavedData = null;
  }

  /** Reads the save into the game. Call once at startup, before any scene uses the profile. */
  load(): LoadReport {
    const main = this.backend.read(KEYS.main);
    const bak = this.backend.read(KEYS.backup);
    let report: LoadReport;
    let applied: SaveData | null = null;

    if (main === null) {
      const fromBackup = bak !== null ? decodeSave(bak) : null;
      if (fromBackup && fromBackup.status !== 'invalid') {
        applied = fromBackup.data;
        report = { source: 'backup', issues: fromBackup.issues, savedAt: fromBackup.savedAt, notice: 'MAIN SAVE WAS MISSING: RESTORED FROM BACKUP' };
      } else {
        // First run (or the old build): import its settings if present.
        const legacy = this.backend.read(KEYS.legacySettings);
        applied = defaultSaveData();
        if (legacy !== null) {
          applied.settings = parseSettings(legacy);
          report = { source: 'legacy', issues: [], savedAt: null, notice: null };
        } else report = { source: 'fresh', issues: [], savedAt: null, notice: null };
      }
    } else {
      const m = decodeSave(main);
      if (m.issues.includes('newer_version')) this.keepAside(KEYS.future, main);
      if (m.status === 'ok') {
        applied = m.data;
        report = { source: 'main', issues: m.issues, savedAt: m.savedAt, notice: null };
      } else {
        this.keepAside(KEYS.corrupt, main);
        const b = bak !== null ? decodeSave(bak) : null;
        if (b && b.status === 'ok') {
          applied = b.data;
          report = { source: 'backup', issues: m.issues, savedAt: b.savedAt, notice: 'SAVE WAS DAMAGED: RESTORED FROM BACKUP' };
        } else if (m.status === 'repaired') {
          applied = m.data;
          const newer = m.issues.includes('newer_version');
          report = { source: 'salvaged', issues: m.issues, savedAt: m.savedAt, notice: newer ? 'SAVE IS FROM A NEWER GAME VERSION: LOADED WHAT WE COULD' : 'SAVE WAS DAMAGED: REPAIRED WHAT WE COULD' };
        } else {
          applied = defaultSaveData();
          report = { source: 'fresh', issues: m.issues, savedAt: null, notice: 'SAVE COULD NOT BE READ: STARTED A NEW GAME (OLD DATA KEPT ASIDE)' };
        }
      }
    }
    this.apply(applied);
    this.lastReport = report;
    // Anything but a clean main save gets written back right away so the stored file is healthy again.
    if (report.source !== 'main') this.save(true);
    else this.lastSavedData = this.snapshot();
    return report;
  }

  private keepAside(key: string, text: string): void {
    try {
      this.backend.write(key, text);
    } catch {
      /* best effort */
    }
  }

  /** Writes the current state if it changed. Returns false only if a needed write failed. */
  save(force = false): boolean {
    const data = this.snapshot();
    if (!force && this.lastSavedData && sameData(data, this.lastSavedData)) return true;
    const text = encodeSave(data, this.now());
    let previous: string | null = null;
    try {
      previous = this.backend.read(KEYS.main);
      // Keep the last good save as a backup before replacing it.
      if (previous !== null && decodeSave(previous).status === 'ok') this.backend.write(KEYS.backup, previous);
      this.backend.write(KEYS.main, text);
      if (this.backend.read(KEYS.main) !== text) throw new Error('verification failed');
      this.lastSavedData = data;
      this.lastSavedAt = this.now();
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      // Try to put the old save back so a half-written file never replaces a good one.
      if (previous !== null) {
        try {
          this.backend.write(KEYS.main, previous);
        } catch {
          /* nothing more we can do */
        }
      }
      return false;
    }
  }

  /** Save soon (coalesces bursts of changes into one write). */
  requestSave(): void {
    if (this.pending) return;
    this.pending = true;
    setTimeout(() => {
      this.pending = false;
      this.save();
    }, 250);
  }

  /** Starts autosaving: whenever settings/bindings change, every few seconds if anything changed, and when the page is hidden or closing. */
  start(): void {
    if (this.timer || typeof window === 'undefined') return;
    onSettingsChange(() => this.requestSave());
    onBindingsChange(() => this.requestSave());
    this.timer = setInterval(() => this.save(), 2000);
    const flush = () => void this.save();
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => document.hidden && flush());
  }

  /** Text of the current save, for copying to another device. */
  exportText(): string {
    return encodeSave(this.snapshot(), this.now());
  }

  /** Replaces the game state with a save pasted by the player. Invalid text changes nothing. */
  importText(text: string): ImportResult {
    const r = decodeSave(text);
    if (r.status === 'invalid') return { ok: false, message: 'NOT A VALID SAVE' };
    this.apply(r.data);
    this.save(true);
    return { ok: true, message: r.status === 'repaired' ? 'IMPORTED (SOME VALUES WERE REPAIRED)' : 'SAVE IMPORTED' };
  }

  /** Wipes career progress (money, cars, scores) but keeps settings and key bindings. The previous save stays as the backup. */
  resetProgress(): void {
    setProfile(createProfile());
    this.save(true);
  }

  /** Resets everything to defaults, including settings and bindings. */
  resetAll(): void {
    this.apply(defaultSaveData());
    setBindings(cloneBindings(defaultSaveData().bindings));
    this.save(true);
  }
}

export const saveManager = new SaveManager();

// Dev-only handle for browser-based testing.
if (typeof window !== "undefined" && import.meta.env?.DEV) (window as unknown as { __save: SaveManager }).__save = saveManager;
