/**
 * Where save text is kept. The save system only talks to this small interface, so cloud saving can be added later
 * by writing another backend (or a wrapper that writes through to the cloud) without touching game code.
 * Methods are synchronous; `write` must throw if the data could not be stored (full disk, blocked storage...).
 */
export interface SaveBackend {
  readonly name: string;
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

/** Keeps saves in memory only (used when browser storage is unavailable, and in tests). */
export class MemoryBackend implements SaveBackend {
  readonly name = 'memory';
  readonly store = new Map<string, string>();
  /** Test hook: make the next writes fail like a full disk. */
  failWrites = false;

  read(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  write(key: string, value: string): void {
    if (this.failWrites) throw new Error('storage full');
    this.store.set(key, value);
  }

  remove(key: string): void {
    this.store.delete(key);
  }
}

/** Browser localStorage. Every call is guarded: private mode, blocked cookies or a full quota become errors the caller handles. */
export class LocalStorageBackend implements SaveBackend {
  readonly name = 'localStorage';

  private get storage(): Storage {
    if (typeof localStorage === 'undefined') throw new Error('localStorage unavailable');
    return localStorage;
  }

  read(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  write(key: string, value: string): void {
    this.storage.setItem(key, value);
  }

  remove(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** localStorage if it really works here, otherwise memory (progress then lasts only for this session). */
export function createDefaultBackend(): SaveBackend {
  try {
    const probe = '__openroad87_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return new LocalStorageBackend();
  } catch {
    return new MemoryBackend();
  }
}
