/**
 * keyStore.ts
 *
 * Where the saves are kept. Every read and write of a save, a character or a character's settings goes through
 * kept(), which is the browser's local storage unless a launch from Steam chose another (steamStore): the same keys
 * held as files that Steam Cloud syncs (desktop/steamSaves.cjs). Keys that belong to the machine stay in local storage
 * either way.
 */

let chosen: Storage | undefined;

/** The store in use: the one chosen with useStore, else local storage (looked up each time, as it may be swapped). */
export function kept(): Storage {
  return chosen ?? globalThis.localStorage;
}

/** Keep from now on in this store. */
export function useStore(s: Storage): void {
  chosen = s;
}

/**
 * Whether a key is a save, the list of characters, or one character's own (their saves and settings). Not their
 * "playing" mark, which only says that this machine has them open (otherWindows.ts).
 */
export function isSteamKey(key: string): boolean {
  if (/^ultima5\.char\.[^.]+\.playing$/.test(key)) return false;
  return /^ultima5\.(save|saves|characters)(\.|$)/.test(key) || key.startsWith('ultima5.char.');
}

/** What the files are written through: false where one could not be written. */
export interface SteamBridge {
  set(key: string, value: string): boolean;
  remove(key: string): boolean;
}

/**
 * A store whose Steam keys are held in memory, from what the files held (`initial`), and written to the files at once,
 * so that a write the disk refuses fails as a full local storage does (QuotaExceededError) and the old value stays.
 * Every other key is local storage's.
 */
export function steamStore(initial: Record<string, string>, bridge: SteamBridge): Storage {
  const held = new Map(Object.entries(initial));
  const local = (): Storage => globalThis.localStorage;
  const keys = (): string[] => {
    const out = [...held.keys()];
    for (let i = 0; i < local().length; i++) {
      const k = local().key(i);
      if (k !== null && !isSteamKey(k)) out.push(k);
    }
    return out;
  };
  return {
    get length() {
      return keys().length;
    },
    key: (i: number) => keys()[i] ?? null,
    getItem: (k: string) => (isSteamKey(k) ? (held.get(k) ?? null) : local().getItem(k)),
    setItem: (k: string, v: string) => {
      if (!isSteamKey(k)) return local().setItem(k, v);
      const text = String(v);
      if (!bridge.set(k, text)) throw new DOMException('The save could not be written.', 'QuotaExceededError');
      held.set(k, text);
    },
    removeItem: (k: string) => {
      if (!isSteamKey(k)) return local().removeItem(k);
      if (!bridge.remove(k)) throw new DOMException('The save could not be removed.', 'NoModificationAllowedError');
      held.delete(k);
    },
    clear: () => {
      for (const k of [...held.keys()]) if (bridge.remove(k)) held.delete(k);
      for (const k of keys()) local().removeItem(k);
    },
  };
}
