/**
 * devMode.ts
 *
 * Whether the development build's own is on while the game runs: the cheats that skip the climb and the story, Auto
 * kill (cheats.ts DEV_CHEATS). Always under the dev server; in any other build when the page is opened with ?dev (or
 * ?dev=true) - on the web by adding it to the address, in the desktop app by launching it with --dev, which
 * desktop/main.cjs passes on - or once the Konami code is entered in the Cheats menu (konami.ts), which is the way on
 * Android. ?dev=false leaves it off. On until the page is left.
 */

/** Whether a page's query (`search`, as location.search) asks for the development cheats. */
export function devAsked(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.has('dev') && q.get('dev') !== 'false';
}

let on: boolean = import.meta.env.DEV || (typeof location !== 'undefined' && devAsked(location.search));

/** Whether the development cheats are on. */
export const devMode = (): boolean => on;

/** Turn the development cheats on, for the rest of the session (the Konami code). */
export function enableDevMode(): void {
  on = true;
}

/** Set them on or off (the tests, which run as the dev server does, to see a release build's Cheats). */
export function setDevMode(value: boolean): void {
  on = value;
}
