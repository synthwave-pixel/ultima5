// web/tests/keyStore.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { chooseCharacter } from '../src/game/characters.ts';
import { isSteamKey, kept, steamStore, useStore } from '../src/game/keyStore.ts';
import { loadOptions, saveOptions } from '../src/game/settings.ts';

/** A stand-in for localStorage. */
function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

/** The localStorage a test found put back (none, where it found none). */
function restore(was: PropertyDescriptor | undefined): void {
  if (was) Object.defineProperty(globalThis, 'localStorage', was);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
}

/** A bridge that keeps what it is given, and fails when told to. */
function bridge(fail = false) {
  const files = new Map<string, string>();
  return {
    files,
    set: (k: string, v: string): true | string => {
      if (fail) return 'ENOSPC';
      files.set(k, v);
      return true;
    },
    remove: (k: string): boolean => {
      if (fail) return false;
      files.delete(k);
      return true;
    },
  };
}

describe('which keys are saves', () => {
  it('takes the saves, the characters and their settings', () => {
    for (const k of [
      'ultima5.save',
      'ultima5.saves',
      'ultima5.saves.2',
      'ultima5.characters',
      'ultima5.char.k3x.save',
      'ultima5.char.k3x.saves',
      'ultima5.char.k3x.settings',
    ])
      expect(isSteamKey(k), k).toBe(true);
  });
  it('leaves the machine settings and everything else', () => {
    for (const k of ['ultima5.settings', 'ultima5.char.k3x.playing', 'ultima5.windows', 'other', 'ultima5.charm'])
      expect(isSteamKey(k), k).toBe(false);
  });
});

describe('the store in use', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  afterEach(() => {
    useStore();
    restore(had);
  });

  it('is localStorage, looked up when asked, until another is chosen', () => {
    const a = memory();
    Object.defineProperty(globalThis, 'localStorage', { value: a, configurable: true, writable: true });
    expect(kept()).toBe(a);
    const b = memory();
    Object.defineProperty(globalThis, 'localStorage', { value: b, configurable: true, writable: true });
    expect(kept()).toBe(b);
    const c = memory();
    useStore(c);
    expect(kept()).toBe(c);
  });
});

describe("Steam's store", () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const local = memory();
  const make = (initial: Record<string, string>, b = bridge()) => {
    Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true, writable: true });
    local.clear();
    return { store: steamStore(initial, b), b };
  };
  afterEach(() => restore(had));

  it('starts from what the files held and passes writes to the bridge', () => {
    const { store, b } = make({ 'ultima5.characters': 'a' });
    expect(store.getItem('ultima5.characters')).toBe('a');
    store.setItem('ultima5.char.k3x.save', 'b');
    expect(store.getItem('ultima5.char.k3x.save')).toBe('b');
    expect(b.files.get('ultima5.char.k3x.save')).toBe('b');
    store.removeItem('ultima5.char.k3x.save');
    expect(store.getItem('ultima5.char.k3x.save')).toBeNull();
    expect(b.files.has('ultima5.char.k3x.save')).toBe(false);
  });

  it('fails a write the files refuse as a full storage does, and keeps the old value', () => {
    const { store } = make({ 'ultima5.char.k3x.save': 'old' }, bridge(true));
    let caught: unknown;
    try {
      store.setItem('ultima5.char.k3x.save', 'new');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DOMException);
    expect((caught as DOMException).name).toBe('QuotaExceededError');
    expect(store.getItem('ultima5.char.k3x.save')).toBe('old');
  });

  it('fails a write refused for any other reason as not kept, not as a full storage', () => {
    const b = { set: () => 'EPERM', remove: () => true };
    const { store } = make({ 'ultima5.char.k3x.save': 'old' }, { ...bridge(), ...b });
    let caught: unknown;
    try {
      store.setItem('ultima5.char.k3x.save', 'new');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DOMException);
    expect((caught as DOMException).name).not.toBe('QuotaExceededError');
    expect(store.getItem('ultima5.char.k3x.save')).toBe('old');
  });

  it('fails a write refused for want of space as a full storage does', () => {
    for (const reason of ['ENOSPC', 'EDQUOT']) {
      const { store } = make({}, { ...bridge(), set: () => reason });
      expect(() => store.setItem('ultima5.save', 'x')).toThrow(expect.objectContaining({ name: 'QuotaExceededError' }));
    }
  });

  it('clears no local key of the same name as a Steam key the files would not let go', () => {
    const { store } = make({ 'ultima5.save': 'old' }, bridge(true));
    local.setItem('ultima5.save', 'from before');
    store.clear();
    expect(local.getItem('ultima5.save')).toBe('from before');
    expect(store.getItem('ultima5.save')).toBe('old');
  });

  it('keeps a removal the files refuse', () => {
    const { store } = make({ 'ultima5.save': 'old' }, bridge(true));
    expect(() => store.removeItem('ultima5.save')).toThrow();
    expect(store.getItem('ultima5.save')).toBe('old');
  });

  it('sends every other key to localStorage, not the bridge', () => {
    const { store, b } = make({});
    store.setItem('ultima5.settings', 'x');
    expect(local.getItem('ultima5.settings')).toBe('x');
    expect(b.files.size).toBe(0);
    expect(store.getItem('ultima5.settings')).toBe('x');
    store.removeItem('ultima5.settings');
    expect(local.getItem('ultima5.settings')).toBeNull();
  });

  it('counts and lists both kinds of key', () => {
    const { store } = make({ 'ultima5.saves': 's' });
    local.setItem('ultima5.settings', 'x');
    expect(store.length).toBe(2);
    expect([store.key(0), store.key(1)].sort()).toEqual(['ultima5.saves', 'ultima5.settings']);
    expect(store.key(2)).toBeNull();
  });
});

describe("settings in Steam's store", () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  afterEach(() => {
    chooseCharacter(null);
    useStore();
    restore(had);
  });

  it("are a chosen character's from the store, and the machine's from localStorage with none chosen", () => {
    const local = memory();
    Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true, writable: true });
    local.setItem('ultima5.settings', JSON.stringify({ scanlines: true }));
    const b = bridge();
    useStore(steamStore({ 'ultima5.char.k3x.save': '{}', 'ultima5.char.k3x.settings': JSON.stringify({ autoCombat: 'all' }) }, b));

    chooseCharacter('k3x');
    expect(loadOptions().autoCombat).toBe('all');
    expect(loadOptions().scanlines).toBe(false); // not the machine's: they have their own block
    saveOptions({ ...loadOptions(), autoCombat: 'off' });
    expect(b.files.get('ultima5.char.k3x.settings')).toContain('"autoCombat":"off"');
    expect(local.getItem('ultima5.char.k3x.settings')).toBeNull();

    chooseCharacter(null);
    expect(loadOptions().scanlines).toBe(true);
    saveOptions({ ...loadOptions(), scanlines: false });
    expect(loadOptions().scanlines).toBe(false);
    expect(local.getItem('ultima5.settings')).toContain('"scanlines":false');
  });
});
