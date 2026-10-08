/**
 * store.ts
 *
 * The installed game files, kept in the browser's IndexedDB (one record
 * per file) so the game starts without asking again - and beside them each
 * one's fingerprint as it was installed, so a file damaged since, in the
 * browser's keeping, is found at the next start rather than mid-game.
 */

import { GameFiles } from '../data/files.ts';
import { fingerprint } from './gameFiles.ts';

const DB = 'ultima5';
const STORE = 'gamefiles';
/** The record of fingerprints, among the files: a key no file is named. */
const PRINTS = '#prints';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

/** The database open for `work`, and closed after it however it ends: a write that fails leaves no connection open. */
async function using<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await open();
  try {
    return await work(db);
  } finally {
    db.close();
  }
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
  });
}

export async function saveInstalled(files: GameFiles): Promise<void> {
  await using((db) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();
    for (const name of files.names()) store.put(files.get(name), name);
    store.put(JSON.stringify(prints(files)), PRINTS);
    return done(tx);
  });
}

const prints = (files: GameFiles): Record<string, string> => Object.fromEntries(files.names().map((n) => [n, fingerprint(files.get(n))]));

export interface Installed {
  files: GameFiles;
  /** Files that are not as they were installed: damaged in the browser's keeping. */
  damaged: string[];
}

/** The installed files, and which of them are not as they were installed; null where none are. */
export async function loadInstalled(): Promise<Installed | null> {
  try {
    const [keys, values] = await using((db) => {
      const store = db.transaction(STORE, 'readonly').objectStore(STORE);
      return Promise.all([
        new Promise<string[]>((res, rej) => {
          const r = store.getAllKeys();
          r.onsuccess = () => res(r.result as string[]);
          r.onerror = () => rej(r.error ?? new Error('read failed'));
        }),
        new Promise<Uint8Array[]>((res, rej) => {
          const r = store.getAll();
          r.onsuccess = () => res(r.result as Uint8Array[]);
          r.onerror = () => rej(r.error ?? new Error('read failed'));
        }),
      ]);
    });
    const at = keys.indexOf(PRINTS);
    const kept = at < 0 ? null : (JSON.parse(values[at] as unknown as string) as Record<string, string>);
    const files = new GameFiles(keys.flatMap((k, i) => (i === at ? [] : [[k, values[i]] as [string, Uint8Array]])));
    if (files.names().length === 0) return null;
    // Installed before the fingerprints were kept: taken as they are, and kept from now on.
    if (!kept) {
      await keepPrints(files).catch(() => undefined);
      return { files, damaged: [] };
    }
    const now = prints(files);
    return { files, damaged: Object.keys(kept).filter((n) => now[n] !== kept[n]) };
  } catch {
    return null;
  }
}

async function keepPrints(files: GameFiles): Promise<void> {
  await using((db) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(JSON.stringify(prints(files)), PRINTS);
    return done(tx);
  });
}

export async function clearInstalled(): Promise<void> {
  await using((db) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    return done(tx);
  });
}
