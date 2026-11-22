import { describe, expect, it } from 'vitest';
import { autoscanAsked, webCopy } from '../src/install/sources.ts';

/** A fetch over a table of paths: bodies for those given, 404 for the rest. */
const site = (table: Record<string, string | Uint8Array>): typeof fetch => {
  return async (url: string | URL | Request) => {
    const urlString = url instanceof Request ? url.url : url instanceof URL ? url.href : url;
    const body = table[urlString];
    if (body === undefined) return new Response('Not found', { status: 404 });
    const responseBody = body instanceof Uint8Array ? new Blob([body as Uint8Array<ArrayBuffer>]) : body;
    return new Response(responseBody);
  };
};

describe("the web's scan", () => {
  it("fetches the site's gamedata/ index and each file in it", async () => {
    const got = await webCopy(
      site({
        '/base/gamedata/index.json': JSON.stringify(['DATA.OVL', 'upgrade/A.XMI']),
        '/base/gamedata/DATA.OVL': new Uint8Array([1, 2]),
        '/base/gamedata/upgrade%2FA.XMI': new Uint8Array([3]),
      }),
      '/base/',
    );
    expect(got).toHaveLength(1);
    expect(got[0].where).toBe('this site');
    expect(got[0].files.map((f) => [f.path, [...f.data]])).toEqual([
      ['DATA.OVL', [1, 2]],
      ['upgrade/A.XMI', [3]],
    ]);
  });

  it('finds nothing on a site with no gamedata/, or one that answers with its page', async () => {
    expect(await webCopy(site({}), '/')).toEqual([]);
    expect(await webCopy(site({ '/gamedata/index.json': '<!doctype html><title>Ultima V</title>' }), '/')).toEqual([]);
  });

  it('starts by itself with ?autoscan=true only', () => {
    expect(autoscanAsked('?autoscan=true')).toBe(true);
    expect(autoscanAsked('?dev&autoscan=true')).toBe(true);
    expect(autoscanAsked('?autoscan=false')).toBe(false);
    expect(autoscanAsked('?autoscan')).toBe(false);
    expect(autoscanAsked('')).toBe(false);
  });
});

describe("the desktop app's scan", () => {
  it('is there only where the app gives the page its bridge, and asks it for the game’s files', async () => {
    const { desktopScan } = await import('../src/install/sources.ts');
    const { REQUIRED } = await import('../src/install/gameFiles.ts');
    const g = globalThis as { u5native?: unknown };
    expect(desktopScan()).toBeNull();
    let asked: string[] = [];
    let extra: string | undefined;
    g.u5native = {
      scanForGameFiles: async (names: string[], also?: string) => {
        asked = names;
        extra = also;
        return [{ where: '/Users/a/u5', files: [{ path: 'DATA.OVL', data: new Uint8Array([1]) }] }];
      },
    };
    try {
      const got = await desktopScan()!();
      expect(asked).toEqual(REQUIRED);
      // The files read beside the names: the game's to say (Ultima V's, the Upgrade's music).
      expect(extra).toBe('\\.XMI$');
      expect(got[0].where).toBe('/Users/a/u5');
    } finally {
      delete g.u5native;
    }
  });
});

describe("the Steam folder's files", () => {
  it('asks the app for the names and the files read beside them', async () => {
    const { steamFound } = await import('../src/install/sources.ts');
    const g = globalThis as { u5native?: unknown };
    const asked: unknown[] = [];
    g.u5native = {
      steam: {
        find: () => ({ steam: true, game: 'ok', where: '~/S' }),
        gameFiles: async (...args: unknown[]) => (asked.push(...args), null),
      },
    };
    try {
      await steamFound()!();
      const { REQUIRED } = await import('../src/install/gameFiles.ts');
      expect(asked).toEqual([REQUIRED, '\\.XMI$']);
    } finally {
      delete g.u5native;
    }
  });
});

describe("the Android app's folder picker", () => {
  it('is there only in the app, and turns its base64 into bytes', async () => {
    const { androidFolder } = await import('../src/install/sources.ts');
    const g = globalThis as { Capacitor?: unknown };
    expect(androidFolder()).toBeNull();
    g.Capacitor = {
      getPlatform: () => 'android',
      Plugins: {
        GameFolder: {
          pick: async (o: unknown) => {
            asked = o;
            return { where: 'Download/u5', files: [{ path: 'DATA.OVL', data: btoa('\x01\x02') }] };
          },
        },
      },
    };
    let asked: unknown;
    try {
      const got = await androidFolder()!();
      const { REQUIRED } = await import('../src/install/gameFiles.ts');
      expect(asked).toEqual({ names: REQUIRED, extra: '\\.XMI$' });
      expect(got?.where).toBe('Download/u5');
      expect([...got!.files[0].data]).toEqual([1, 2]);
      (g.Capacitor as { Plugins: { GameFolder: { pick: () => Promise<unknown> } } }).Plugins.GameFolder.pick = async () => ({
        cancelled: true,
      });
      expect(await androidFolder()!()).toBeNull();
    } finally {
      delete g.Capacitor;
    }
  });
});
