/**
 * keyStore.ts
 *
 * Where the saves are kept. Every read and write of a save, a character or a character's settings goes through
 * kept(), which is the browser's local storage unless a launch from Steam chose another (steamStore): the same keys
 * held as files that Steam Cloud syncs (desktop/steamSaves.cjs). Keys that belong to the machine stay in local storage
 * either way.
 */

import type { CloudSaves, SteamSwitched } from './game.ts';

let chosen: Storage | undefined;

/** The store in use: the one chosen with useStore, else local storage (looked up each time, as it may be swapped). */
export function kept(): Storage {
  return chosen ?? globalThis.localStorage;
}

/** Keep from now on in this store; none, local storage. */
export function useStore(s?: Storage): void {
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

/**
 * What the files are written through. A write says true, or why it could not be made: the system's code for it
 * ('ENOSPC' for a full disk), or false with none. A removal says false where it could not be made.
 */
export interface SteamBridge {
  set(key: string, value: string): true | string | false;
  remove(key: string): boolean;
}

/** The codes of a write refused for want of space: a full disk, or the account's quota spent. */
const NO_ROOM = new Set(['ENOSPC', 'EDQUOT']);

/**
 * A store whose Steam keys are held in memory, from what the files held (`initial`), and written to the files at once,
 * so that a write the disk refuses fails at once and the old value stays. Only a full disk fails as a full local
 * storage does (QuotaExceededError), for storage.ts to let earlier saves go to make room; any other refusal (a file
 * held open, a read-only card) fails as one that letting saves go would not help. Every other key is local storage's.
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
      const written = bridge.set(k, text);
      if (written !== true) {
        const name = typeof written === 'string' && NO_ROOM.has(written) ? 'QuotaExceededError' : 'NoModificationAllowedError';
        throw new DOMException('The save could not be written.', name);
      }
      held.set(k, text);
    },
    removeItem: (k: string) => {
      if (!isSteamKey(k)) return local().removeItem(k);
      if (!bridge.remove(k)) throw new DOMException('The save could not be removed.', 'NoModificationAllowedError');
      held.delete(k);
    },
    clear: () => {
      for (const k of [...held.keys()]) if (bridge.remove(k)) held.delete(k);
      // Only local storage's own keys: a Steam key the files would not let go keeps any local key of its name too.
      for (const k of keys()) if (!isSteamKey(k)) local().removeItem(k);
    },
  };
}

/** What Steam Cloud saves' copy reaches through the desktop app (install/sources.ts SteamNative). */
export interface CloudBridge {
  saves: { all(): Record<string, string> | null } & SteamBridge;
  setOption(name: 'cloud', on: boolean, failed?: string): Promise<SteamSwitched | null>;
  /** This launch's Steam account, null with none known. */
  options(): { account: string | null };
}

/**
 * Where this machine keeps that an account's player has been told how saves are kept with Cloud saves on (boot.ts
 * steamNote), under the account's id: `${STEAM_NOTED_KEY}.<account>`.
 */
export const STEAM_NOTED_KEY = 'ultima5.steamNoted';

/**
 * The two sides of Steam Cloud saves' copy (game.ts CloudSaves): this computer's own saves - local storage itself,
 * whichever store the game keeps in now - and Steam's folder, through the app. Once the switch is recorded, the game
 * keeps from then on in Steam's folder (on) or local storage (off), as the next launch would choose (boot.ts chooseStore).
 */
export function cloudSaves(native: CloudBridge): CloudSaves {
  const local = (): Storage => globalThis.localStorage;
  return {
    own() {
      const out: Record<string, string> = {};
      for (let i = 0; i < local().length; i++) {
        const k = local().key(i);
        const v = k === null ? null : local().getItem(k);
        if (k !== null && v !== null) out[k] = v;
      }
      return out;
    },
    steam: () => native.saves.all(),
    write(side, key, value) {
      if (side === 'steam') {
        const written = native.saves.set(key, value);
        return written === true ? true : written || 'refused';
      }
      try {
        local().setItem(key, value);
        return true;
      } catch (e) {
        return (e instanceof Error && e.name) || 'refused';
      }
    },
    remove(side, key) {
      if (side === 'steam') return native.saves.remove(key);
      try {
        local().removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
    async record(on, failed) {
      const r = await native.setOption('cloud', on, failed);
      // Turned on here, the player has just been told how the saves are kept: the next Steam launch need not say it again.
      const account = r?.on === true && on && failed === undefined ? native.options().account : null;
      if (account !== null) {
        try {
          localStorage.setItem(`${STEAM_NOTED_KEY}.${account}`, '1');
        } catch {
          // Nowhere to keep it: the next launch says it once more.
        }
      }
      return r;
    },
    use(on) {
      const all = on ? native.saves.all() : null;
      useStore(all ? steamStore(all, native.saves) : undefined);
    },
  };
}
