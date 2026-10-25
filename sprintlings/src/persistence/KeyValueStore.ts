/** Minimal async key/value storage used for settings and the local profile. */
export interface KeyValueStore {
  readonly name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  readonly name = 'memory';
  private readonly map = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export class LocalStorageStore implements KeyValueStore {
  readonly name = 'localStorage';
  constructor(private readonly prefix = 'sprintlings:') {}
  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(this.prefix + key);
    } catch {
      return null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(this.prefix + key, value);
    } catch {
      /* storage full or blocked: ignore, game keeps running */
    }
  }
  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch {
      /* ignore */
    }
  }
}

/** IndexedDB-backed store (preferred in browsers). Falls back to null values on errors. */
export class IndexedDbStore implements KeyValueStore {
  readonly name = 'indexedDB';
  private dbPromise: Promise<IDBDatabase> | null = null;

  static available(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('sprintlings', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction('kv', mode);
      const req = run(t.objectStore('kv'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      const v = await this.tx('readonly', (s) => s.get(key));
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await this.tx('readwrite', (s) => s.put(value, key));
    } catch {
      /* ignore */
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.tx('readwrite', (s) => s.delete(key));
    } catch {
      /* ignore */
    }
  }
}

/** Picks the best available browser store. */
export async function createBrowserStore(): Promise<KeyValueStore> {
  if (IndexedDbStore.available()) {
    const store = new IndexedDbStore();
    try {
      await store.set('__probe', '1');
      if ((await store.get('__probe')) === '1') return store;
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.setItem('sprintlings:__probe', '1');
    return new LocalStorageStore();
  } catch {
    return new MemoryStore();
  }
}
