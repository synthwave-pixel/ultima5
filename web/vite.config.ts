import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** The developer's own copy of the DOS files, for the tests and the dev server (gamedata/README.md). */
const GAMEDATA = fileURLToPath(new URL('../gamedata/ultima5', import.meta.url));

/** /debug in development: the debug index (debug.html), its query kept - rather than the game, the server's fallback. */
function debugIndex(): Plugin {
  return {
    name: 'debug-index',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/debug\/?(\?.*)?$/.exec(req.url ?? '');
        if (!m) return next();
        res.statusCode = 302;
        res.setHeader('Location', `/debug.html${m[1] ?? ''}`);
        res.end();
      });
    },
  };
}

/**
 * Development only: serves ../gamedata/ultima5 at /gamedata/, with an index at /gamedata/index.json, for the installer's Scan for game
 * files... (install/sources.ts webCopy). Never part of a production build.
 */
function devGameData(): Plugin {
  return {
    name: 'dev-gamedata',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/gamedata/', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '/').slice(1).split('?')[0]);
        try {
          if (name === 'index.json') {
            const files = readdirSync(GAMEDATA).filter((f) => statSync(join(GAMEDATA, f)).isFile());
            // The Upgrade's music, from its folder.
            const upgrade = join(GAMEDATA, 'upgrade');
            if (existsSync(upgrade)) for (const f of readdirSync(upgrade)) if (f.toUpperCase().endsWith('.XMI')) files.push(`upgrade/${f}`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(files));
            return;
          }
          if (name.includes('..') || (name.includes('/') && !/^upgrade\/[^/]+\.XMI$/i.test(name))) return next();
          res.setHeader('Content-Type', 'application/octet-stream');
          res.end(readFileSync(join(GAMEDATA, name)));
        } catch {
          next();
        }
      });
    },
  };
}

/**
 * The tests. The readers and rules run in Node against the developer's own DOS files in ../gamedata/ultima5; without
 * them `npm test` stops at once and says what is needed, rather than passing on a handful. `npm run test:nodata`
 * (--mode nodata) runs those that need none - the files that neither use tests/helpers.ts nor name gamedata - as a
 * checkout without the game (a CI runner) can.
 */
function tests(mode: string): string[] {
  const dir = fileURLToPath(new URL('tests', import.meta.url));
  if (mode === 'nodata')
    return readdirSync(dir)
      .filter((f) => f.endsWith('.test.ts') && !/helpers|gamedata/i.test(readFileSync(join(dir, f), 'utf8')))
      .map((f) => `tests/${f}`);
  if (process.env.VITEST && !existsSync(join(GAMEDATA, 'DATA.OVL'))) {
    console.error(
      [
        '',
        `The tests need Ultima V's DOS files (DATA.OVL and the rest) in ${GAMEDATA}`,
        "- the player's own copy, from GOG or the original disks; gamedata/README.md says where each goes.",
        'Without them, `npm run test:nodata` runs the tests that need no game files.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  return ['tests/**/*.test.ts'];
}

export default defineConfig(({ mode }) => ({
  // VITE_BASE lets a deployment under a sub-path (GitHub Pages) prefix asset URLs.
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    devGameData(),
    debugIndex(),
    // `npm run dev:https`: the dev server over HTTPS, on a certificate of its own making (the browser warns once), so
    // another device on the network has what only a secure page may use - the clipboard (Copy to clipboard).
    { ...basicSsl(), apply: (_, env) => env.command === 'serve' && env.mode === 'https' },
    // An installable app that works offline. The game files are the player's
    // own and live in IndexedDB, not in the precache.
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Ultima V',
        short_name: 'Ultima V',
        description: 'Ultima V: Warriors of Destiny, on a new engine, with your own copy of the game',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The music (some 60 MB) is not fetched with the page: each tune is fetched the first time it plays, then kept
        // (runtimeCaching below). The XMI files are only the render's source (tools/music).
        globPatterns: ['**/*.{js,css,html,png,gif,jpg,svg,wav,json,webmanifest,ttf}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globIgnores: [
          'tiles.html',
          'deltas.html',
          'grass.html',
          'appearance.html',
          'sounds.html',
          'pictures.html',
          'dungeon.html',
          'mapcells.html',
          'runes.html',
          'debug.html',
          'assets/tiles-*.js',
          'assets/deltas-*.js',
          'assets/grass-*.js',
          'assets/appearance-*.js',
          'assets/sounds-*.js',
          'assets/pictures-*.js',
          'assets/dungeon-*.js',
          'assets/mapcells-*.js',
          'assets/runes-*.js',
          'assets/debug-*.js',
        ],
        runtimeCaching: [
          {
            // A file is named for what it holds (BRITLAND.3fa9c01d.ogg: tools/music/render.ts), so a tune rendered again
            // is a new URL and never the old one kept; the old entries age out.
            urlPattern: /\/music\/[a-z]+\/[A-Z0-9]+\.[0-9a-f]{8}\.ogg$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'music',
              expiration: { maxEntries: 160, maxAgeSeconds: 90 * 24 * 60 * 60 },
              rangeRequests: true,
            },
          },
        ],
        navigateFallbackDenylist: [
          /\/flatpak\//,
          /\/(tiles|deltas|grass|appearance|sounds|pictures|dungeon|mapcells|runes|debug)\.html(\?|$)/,
        ],
      },
    }),
  ],
  // Open on the local network (--host), so a phone or another machine can play the dev build.
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    // The game, and the test pages (tiles, deltas, grass, appearance, sounds, pictures, dungeon, mapcells, runes) and their index (debug), which nothing links to.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        tiles: fileURLToPath(new URL('tiles.html', import.meta.url)),
        deltas: fileURLToPath(new URL('deltas.html', import.meta.url)),
        grass: fileURLToPath(new URL('grass.html', import.meta.url)),
        appearance: fileURLToPath(new URL('appearance.html', import.meta.url)),
        sounds: fileURLToPath(new URL('sounds.html', import.meta.url)),
        pictures: fileURLToPath(new URL('pictures.html', import.meta.url)),
        dungeon: fileURLToPath(new URL('dungeon.html', import.meta.url)),
        mapcells: fileURLToPath(new URL('mapcells.html', import.meta.url)),
        runes: fileURLToPath(new URL('runes.html', import.meta.url)),
        debug: fileURLToPath(new URL('debug.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'node',
    include: tests(mode),
    // A CI runner's few cores run many test files at once, and the heavier drawing tests overrun the 5 s default there.
    testTimeout: process.env.CI ? 30000 : 5000,
  },
}));
