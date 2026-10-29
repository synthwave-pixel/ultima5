import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connect, STATUS, watch, type PortalConnection, type UpdateMonitor } from '../../desktop/flatpakUpdates.cjs';
import { applyUpdate, checkForUpdates, currentOffer } from '../../desktop/updates.cjs';

/** A portal of our own: what was asked of it, and its signals to send. */
function fakePortal() {
  const asked = { updates: 0, spawned: 0 };
  const send = { available: () => {}, progress: (_p: { status: number; error_message?: string }) => {} };
  const monitor: UpdateMonitor = {
    onAvailable: (fn) => void (send.available = fn),
    onProgress: (fn) => void (send.progress = fn),
    update: async () => void asked.updates++,
  };
  const portal: PortalConnection = { createMonitor: async () => monitor, spawnLatest: async () => void asked.spawned++ };
  return { asked, send, portal };
}

/** The Flatpak's updates through Flatpak's update portal (desktop/flatpakUpdates.cjs, updates.cjs). */
describe('the Flatpak’s updates', () => {
  let dir = '';
  const was = { platform: process.platform, flatpak: process.env.FLATPAK_ID };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'u5-flatpak-'));
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.FLATPAK_ID = 'com.synthwavepixel.ultima5';
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: was.platform });
    if (was.flatpak === undefined) delete process.env.FLATPAK_ID;
    else process.env.FLATPAK_ID = was.flatpak;
    rmSync(dir, { recursive: true, force: true });
  });

  /** The app, GitHub's newest release `latest` (null: offline), and a look through `portal` (null: none to be had). */
  const look = async (latest: string | null, portal: PortalConnection | null, quiet = false) => {
    const quits = { n: 0 };
    const electron = {
      app: { isPackaged: true, getVersion: () => '1.1.10', quit: () => void quits.n++ },
      net: {
        fetch: async () => {
          if (latest === null) throw new Error('offline');
          return { ok: true, json: async () => ({ tag_name: `v${latest}` }) };
        },
      },
      shell: { openExternal: async () => undefined },
    };
    await checkForUpdates({ electron, quiet, file: join(dir, 'updates.json'), flatpak: { connect: async () => portal, watch } });
    return { electron, quits };
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('asks for the newer release at once, waits for the repository, and offers the restart into it', async () => {
    const { asked, send, portal } = fakePortal();
    const { electron, quits } = await look('1.1.12', portal);
    expect(asked.updates).toBe(1);
    // The repository not yet holding it (the Pages deploy behind the release): asked again when the portal sees it.
    send.progress({ status: STATUS.empty });
    send.available();
    expect(asked.updates).toBe(2);
    send.progress({ status: STATUS.running });
    send.progress({ status: STATUS.done });
    expect(currentOffer()).toEqual({ kind: 'restart', installed: true, quits: false, version: '1.1.12', current: '1.1.10', told: false });
    // Restart now: the newest version started, this one gone.
    expect(applyUpdate({ electron })).toBe(true);
    await settle();
    expect(asked.spawned).toBe(1);
    expect(quits.n).toBe(1);
    // Nothing more once installed.
    send.available();
    expect(asked.updates).toBe(2);
  });

  it('under Game Mode, takes the update up by quitting only, to be started again from Steam', async () => {
    const { asked, send, portal } = fakePortal();
    const { electron, quits } = await look('1.1.12', portal, true);
    send.progress({ status: STATUS.done });
    expect(currentOffer()).toMatchObject({ kind: 'restart', installed: true, quits: true });
    applyUpdate({ electron });
    await settle();
    expect(asked.spawned).toBe(0);
    expect(quits.n).toBe(1);
  });

  it('up to date (or offline), waits for the portal to see a newer one', async () => {
    const { asked, send, portal } = fakePortal();
    await look(null, portal);
    expect(asked.updates).toBe(0);
    send.available();
    expect(asked.updates).toBe(1);
    send.progress({ status: STATUS.done });
    expect(currentOffer()).toEqual({ kind: 'restart', installed: true, quits: false, current: '1.1.10', told: false });
  });

  it('without the portal, tells of the release instead - its page, or under Game Mode only the way to it', async () => {
    await look('1.1.13', null);
    expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.13', current: '1.1.10', told: false });
    const { electron } = await look('1.1.14', null, true);
    expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.14', current: '1.1.10', told: false, page: false });
    expect(applyUpdate({ electron })).toBe(false); // nothing to open
  });

  it('when the update fails, tells of the release instead', async () => {
    const { send, portal } = fakePortal();
    await look('1.1.15', portal);
    send.progress({ status: STATUS.error, error_message: 'no space' });
    expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.15', current: '1.1.10', told: false });
  });
});

/** The D-Bus side (flatpakUpdates.cjs connect), against a bus of our own. */
describe('Flatpak’s update portal, on the bus', () => {
  const bus = (version: number) => {
    const calls: unknown[][] = [];
    const objects: string[] = [];
    const signals: Record<string, (info: unknown) => void> = {};
    const dbus = {
      sessionBus: () => ({
        disconnect: () => calls.push(['disconnect']),
        getProxyObject: async (_name: string, path: string) => {
          objects.push(path);
          return {
            getInterface: (iface: string) =>
              iface === 'org.freedesktop.DBus.Properties'
                ? { Get: async () => ({ value: version }) }
                : iface === 'org.freedesktop.portal.Flatpak'
                  ? {
                      CreateUpdateMonitor: async (o: unknown) => (calls.push(['CreateUpdateMonitor', o]), '/monitor/1'),
                      Spawn: async (...a: unknown[]) => void calls.push(['Spawn', ...a]),
                    }
                  : {
                      on: (name: string, fn: (info: unknown) => void) => void (signals[name] = fn),
                      Update: async (...a: unknown[]) => void calls.push(['Update', ...a]),
                    },
          };
        },
      }),
    };
    return { dbus, calls, objects, signals };
  };

  it('is not had from a portal too old for update monitors', async () => {
    const { dbus, calls } = bus(3);
    expect(await connect({ dbus })).toBeNull();
    expect(calls).toEqual([['disconnect']]);
  });

  it('makes a monitor, asks it to update, reads its progress, and spawns the newest version', async () => {
    const { dbus, calls, objects, signals } = bus(6);
    const portal = (await connect({ dbus }))!;
    const monitor = await portal.createMonitor();
    expect(objects).toEqual(['/org/freedesktop/portal/Flatpak', '/monitor/1']);
    const seen: unknown[] = [];
    monitor.onProgress((p) => seen.push(p));
    signals.Progress({ status: { signature: 'u', value: 2 }, n_ops: { signature: 'u', value: 1 } });
    expect(seen).toEqual([{ status: 2, n_ops: 1 }]);
    await monitor.update();
    await portal.spawnLatest();
    expect(calls).toEqual([
      ['CreateUpdateMonitor', {}],
      ['Update', '', {}],
      ['Spawn', Buffer.from('/\0'), [Buffer.from('electron-wrapper\0')], {}, {}, 2, {}],
    ]);
  });
});
