/**
 * crash.ts
 *
 * When the game breaks - an error nothing caught, a promise refused that nothing was waiting on - a box over the
 * canvas says so, in the notice's look (notice.ts), rather than the game standing still with nothing said: the desktop
 * and Android apps have no reload button of the browser's to fall back on. It keeps the last save, and offers two
 * things, by controller, keys, mouse or finger: Copy the details (for a bug report: what went wrong and where, the
 * version, the browser, the page's query) and Reload. One box at a time; what goes wrong after it opens is added to its
 * details. Noise that is not the game's - a browser extension's errors, another site's script ("Script error."), the
 * browser's own ResizeObserver warning, a fetch called off - opens nothing.
 */

import { version } from '../../package.json';
import { driveMenu, usable } from './pageMenu.ts';

/** One thing that went wrong: what, and where in the code (the stack, if there is one). */
export interface Fault {
  message: string;
  stack: string;
}

/** What the browser hands the handlers: an error event's parts, or a refused promise's reason. */
export interface Thrown {
  /** The thrown value (an error event's `error`, a rejection's `reason`). */
  error: unknown;
  /** An error event's own message and source, where the thrown value is missing (a cross-origin script). */
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  rejection?: boolean;
}

/** Schemes of a browser extension's own scripts: their errors are not the game's. */
const EXTENSION = /\b(?:chrome|moz|safari|safari-web|ms-browser)-extension:\/\//;

/**
 * Whether what was thrown is not the game's breaking: another origin's script, whose error the browser hides behind
 * "Script error." and no stack; an extension's; the ResizeObserver loop the browser reports and recovers from; a fetch
 * or a sound called off (an AbortError), which was meant.
 */
export function isNoise(t: Thrown): boolean {
  const err = t.error;
  const message = err instanceof Error ? err.message : (t.message ?? '');
  const stack = err instanceof Error ? (err.stack ?? '') : '';
  if (err == null && !t.rejection && /^Script error\.?$/i.test(t.message ?? '')) return true;
  if (/^ResizeObserver loop/.test(message) || /^ResizeObserver loop/.test(t.message ?? '')) return true;
  if (EXTENSION.test(t.filename ?? '') || EXTENSION.test(stack)) return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  // A DOMException is an Error in browsers, but not always in a web view of an older engine.
  if (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError') return true;
  return false;
}

/** What went wrong, as words: the error's name and message, and its stack without the message said twice. */
export function faultOf(t: Thrown): Fault {
  const err = t.error;
  const where = t.filename ? `${t.filename}:${t.lineno ?? 0}:${t.colno ?? 0}` : '';
  if (err instanceof Error) {
    const message = `${err.name}: ${err.message}`;
    let stack = (err.stack ?? '').trimEnd();
    // V8 begins the stack with the message; Firefox and WebKit do not.
    if (stack.startsWith(message)) stack = stack.slice(message.length).replace(/^\n/, '');
    return { message: t.rejection ? `Unhandled rejection: ${message}` : message, stack: stack || where };
  }
  let said: string;
  if (err === undefined || err === null)
    said = t.message ?? (t.rejection ? 'A promise was refused, with no reason given' : 'Unknown error');
  else if (typeof err === 'string') said = err;
  else {
    // As JSON where it can be (a plain object refused with), else its kind ([object Function]).
    try {
      said = JSON.stringify(err) ?? Object.prototype.toString.call(err);
    } catch {
      said = Object.prototype.toString.call(err);
    }
  }
  return { message: t.rejection ? `Unhandled rejection: ${said}` : said, stack: where };
}

/** The most kept: a fault repeating every frame says so once, with its count, and the box's details stay readable. */
const KEPT = 20;

/** What has gone wrong this session, the same fault counted rather than kept again. */
export class CrashLog {
  readonly faults: (Fault & { times: number })[] = [];
  /** Faults past the most kept, not shown. */
  dropped = 0;

  /** `f` counted in: 'new' if it is the first of all (the box opens), 'more' if another, 'again' if seen before. */
  add(f: Fault): 'new' | 'more' | 'again' {
    const seen = this.faults.find((g) => g.message === f.message && g.stack === f.stack);
    if (seen) {
      seen.times++;
      return 'again';
    }
    const first = this.faults.length === 0 && this.dropped === 0;
    if (this.faults.length < KEPT) this.faults.push({ ...f, times: 1 });
    else this.dropped++;
    return first ? 'new' : 'more';
  }
}

/** Where the game is running, for the details: the version and build, the browser, the page's query, when. */
export interface Setting {
  version: string;
  userAgent: string;
  query: string;
  when: Date;
}

/** The details, as copied for a bug report and shown in the box. */
export function crashDetails(log: CrashLog, at: Setting): string {
  const lines = [
    'Ultima V - crash details',
    `Version: ${at.version}`,
    `When: ${at.when.toISOString()}`,
    `Browser: ${at.userAgent}`,
    `Query: ${at.query || '(none)'}`,
  ];
  for (const f of log.faults) {
    lines.push('', f.times > 1 ? `${f.message} (x${f.times})` : f.message);
    if (f.stack) lines.push(...f.stack.split('\n').map((l) => (/^\s/.test(l) ? l : `    ${l}`)));
  }
  if (log.dropped) lines.push('', `(${log.dropped} more not kept)`);
  return lines.join('\n');
}

/**
 * The version, and the build it is: the bundle's own file name carries a hash of its contents (index-1a2b3c.js), which
 * names the build exactly where the package's version is not changed between them.
 */
function versionNow(): string {
  const file = new URL(import.meta.url).pathname.split('/').pop() ?? '';
  return import.meta.env.DEV ? `${version} (development)` : `${version} (${file})`;
}

const STYLE = `
.u5-crash { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.85); color: #aaa; font: 16px/1.5 ui-monospace, Menlo, Consolas, monospace;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  box-sizing: border-box; z-index: 30; }
.u5-crash .box { max-width: 640px; width: 100%; max-height: 100%; display: flex; flex-direction: column;
  background: #000; border: 2px solid #55f; padding: 20px 24px; box-sizing: border-box; }
.u5-crash h1 { color: #fff; font-size: 18px; margin: 0 0 10px; letter-spacing: 1px; }
.u5-crash p { margin: 0 0 12px; }
.u5-crash textarea { flex: 1 1 auto; min-height: 6em; height: 12em; margin: 0 0 12px; resize: none; background: #000;
  color: #aaa; border: 1px solid #555; padding: 6px 8px; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace;
  white-space: pre-wrap; overflow-wrap: anywhere; overflow-y: auto; box-sizing: border-box; }
.u5-crash .said { min-height: 1.5em; color: #ff5; }
.u5-crash button { font: inherit; background: #0000aa; color: #fff; border: 2px solid #55f; padding: 8px 20px;
  margin: 4px 8px 0 0; cursor: pointer; }
.u5-crash button:focus { outline: none; }
.u5-crash button.at { outline: 2px solid #ff5; outline-offset: 2px; }
`;

const log = new CrashLog();
let details: HTMLTextAreaElement | null = null;

/** The details as they stand. */
function detailsNow(): string {
  return crashDetails(log, {
    version: versionNow(),
    userAgent: navigator.userAgent,
    query: location.search,
    when: new Date(),
  });
}

/** Whether the crash box is up. */
export function crashShowing(): boolean {
  return details !== null;
}

/**
 * Something thrown, counted in: the box opened on the first, its details brought up to date after. Noise is let be;
 * nothing here throws in turn (a crash box that breaks would be reported to itself).
 */
export function reportCrash(t: Thrown): void {
  try {
    if (isNoise(t)) return;
    log.add(faultOf(t));
    if (details) details.value = detailsNow();
    else showCrash();
  } catch (e) {
    console.error('The crash box could not be shown', e);
  }
}

/** The box, over everything. */
function showCrash(): void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'u5-crash';
  root.innerHTML = `
    <div class="box" role="alertdialog" aria-modal="true" aria-labelledby="u5-crash-title" aria-describedby="u5-crash-text">
      <h1 id="u5-crash-title">Something has gone wrong</h1>
      <p id="u5-crash-text">The game has hit a problem and cannot be trusted to go on. Your last save is kept: reload to carry
        on from it. The details below say what went wrong, for a bug report.</p>
      <textarea readonly spellcheck="false" aria-label="Details" tabindex="-1"></textarea>
      <p class="said" aria-live="polite"></p>
      <div>
        <button type="button" data-copy>Copy the details</button>
        <button type="button" data-reload>Reload</button>
      </div>
    </div>`;
  const area = root.querySelector('textarea') as HTMLTextAreaElement;
  const said = root.querySelector('.said') as HTMLElement;
  const copy = root.querySelector('[data-copy]') as HTMLButtonElement;
  const reload = root.querySelector('[data-reload]') as HTMLButtonElement;
  details = area;
  area.value = detailsNow();
  document.body.appendChild(root);

  copy.addEventListener('click', () => {
    const text = detailsNow();
    area.value = text;
    // The clipboard where the page may write it; else the details chosen in their box and copied the old way (a web
    // view, an insecure page); else left chosen, to copy by hand.
    const byHand = (): void => {
      area.focus();
      area.select();
      let done = false;
      try {
        // The old way, deprecated but alone in working where the clipboard's own is refused.
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        done = document.execCommand('copy');
      } catch {
        /* refused */
      }
      said.textContent = done
        ? 'The details are copied.'
        : 'The clipboard is refused here: the details are selected above, to copy by hand.';
      // Left selected, they keep the focus, so the selection shows and the keyboard's copy takes it; a press of the
      // d-pad comes back to the buttons.
      if (done) copy.focus();
    };
    if (navigator.clipboard?.writeText)
      navigator.clipboard.writeText(text).then(() => (said.textContent = 'The details are copied.'), byHand);
    else byHand();
  });
  reload.addEventListener('click', () => location.reload());

  driveMenu(root, {
    buttons: () => [copy, reload].filter(usable),
    first: () => copy,
    // Up and down read the details, a few lines at a time; there is nothing to back out to.
    take: (p) => {
      if (p !== 'up' && p !== 'down') return false;
      area.scrollTop += (p === 'up' ? -1 : 1) * 4 * 17;
      return true;
    },
  });
}

/** Listen for what breaks, from now on. */
export function installCrashHandler(): void {
  window.addEventListener('error', (e) =>
    reportCrash({ error: e.error as unknown, message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno }),
  );
  window.addEventListener('unhandledrejection', (e) => reportCrash({ error: e.reason as unknown, rejection: true }));
}
