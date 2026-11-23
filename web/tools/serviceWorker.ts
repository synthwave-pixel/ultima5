/**
 * serviceWorker.ts
 *
 * The service worker's run-time caching (vite.config.ts's workbox.runtimeCaching): what is fetched as it is first
 * needed, rather than with the page, and kept. Each cache is named for the game (brand.ts cacheName), as every game on
 * one origin (github.io: /ultima5/, /ultima4/) shares one Cache Storage - and Workbox's expiration keeps its records in
 * one database for the origin, by cache name - so two games never keep, age out or clear each other's.
 */

import type { VitePWAOptions } from 'vite-plugin-pwa';
import { cacheName, MUSIC_FOLDER } from '../src/brand.ts';

/** One route of the service worker's run-time caching. */
export type RuntimeCaching = NonNullable<NonNullable<VitePWAOptions['workbox']>['runtimeCaching']>[number];

/** MUSIC_FOLDER as it goes into a regular expression. */
const FOLDER = MUSIC_FOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The routes: the game's music, a tune at a time. */
export function runtimeCaching(): RuntimeCaching[] {
  return [
    {
      // A file is named for what it holds (BRITLAND.3fa9c01d.ogg: tools/music/render.ts), so a tune rendered again is a
      // new URL and never the old one kept; the old entries age out.
      urlPattern: new RegExp(`/${FOLDER}/[a-z]+/[A-Z0-9]+\\.[0-9a-f]{8}\\.ogg$`),
      handler: 'CacheFirst',
      options: {
        cacheName: cacheName('music'),
        expiration: { maxEntries: 160, maxAgeSeconds: 90 * 24 * 60 * 60 },
        rangeRequests: true,
      },
    },
  ];
}
