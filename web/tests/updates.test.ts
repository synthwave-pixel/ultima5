import { describe, expect, it } from 'vitest';
import { androidUpdates, desktopUpdates, isNewer, RELEASES, webUpdates, type UpdateOffer } from '../src/ui/updates.ts';

/** A newer version, as the page learns of it (ui/updates.ts). */
describe('updates, as the page has them', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('compare versions as the releases number them', () => {
    expect(isNewer('1.1.44', '1.1.43')).toBe(true);
    expect(isNewer('v1.1.43', '1.1.43')).toBe(false);
    expect(isNewer('1.1.9', '1.1.10')).toBe(false);
    expect(isNewer('1.1.0', '1.1.0-dev.20261009.1200')).toBe(true);
  });

  it('on Android: a newer GitHub release than the APK, its page opened, told of once a version', async () => {
    let told: string | null = null;
    const opened: string[] = [];
    const make = (latest: string, version = '1.1.43') =>
      androidUpdates({
        version: async () => version,
        openUrl: (url) => opened.push(url),
        fetch: (async () => ({ ok: true, json: async () => ({ tag_name: latest }) })) as unknown as typeof fetch,
        told: { get: () => told, set: (v) => (told = v) },
      });
    const update = make('v1.1.44');
    await settle();
    expect(update.offer()).toEqual({ kind: 'release', version: '1.1.44', current: '1.1.43', told: false });
    update.told();
    expect(told).toBe('1.1.44');
    expect(update.offer()?.told).toBe(true);
    update.apply();
    expect(opened).toEqual([RELEASES]);
    // Started again: told already; and up to date, nothing.
    const again = make('v1.1.44');
    await settle();
    expect(again.offer()?.told).toBe(true);
    const current = make('v1.1.43');
    await settle();
    expect(current.offer()).toBeNull();
  });

  it('on Android, offline: nothing, and no error', async () => {
    const update = androidUpdates({
      version: async () => '1.1.43',
      openUrl: () => undefined,
      fetch: async () => {
        throw new Error('offline');
      },
      told: { get: () => null, set: () => undefined },
    });
    await settle();
    expect(update.offer()).toBeNull();
  });

  it('on the desktop: what its main process tells, taken up and told through it', async () => {
    const calls: string[] = [];
    let listener: (o: UpdateOffer | null) => void = () => undefined;
    const update = desktopUpdates({
      offer: async () => null,
      apply: async () => calls.push('apply'),
      told: async () => calls.push('told'),
      onChange: (l) => (listener = l),
    });
    await settle();
    expect(update.offer()).toBeNull();
    listener({ kind: 'restart', version: '1.1.44', current: '1.1.43', told: false });
    expect(update.offer()?.kind).toBe('restart');
    update.told();
    update.apply();
    await settle();
    expect(update.offer()?.told).toBe(true);
    expect(calls).toEqual(['told', 'apply']);
  });

  it('on the web: the service worker’s build, a restart, no box', () => {
    let ready = false;
    let restarted = 0;
    const update = webUpdates(
      () => ready,
      () => void restarted++,
    );
    expect(update.offer()).toBeNull();
    ready = true;
    expect(update.offer()).toEqual({ kind: 'restart', told: true });
    update.apply();
    expect(restarted).toBe(1);
  });
});
