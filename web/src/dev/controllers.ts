/**
 * controllers.ts
 *
 * The controller page (controllers.html): every slot of the browser's gamepad list, live - its name, place, mapping,
 * timestamp, buttons and sticks - the pad the game would read marked, and a log of what changed (padWatch.ts), read
 * at every frame as the game reads them. Copy report puts the record and the browser's particulars on the clipboard,
 * for a player to paste into an issue. It needs no game files, and reads the list as the game does (pads.ts).
 */

import { browserPadList } from '../ui/pads.ts';
import { PadWatch } from './padWatch.ts';

const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Sel', 'Start', 'LS', 'RS', 'Up', 'Down', 'Left', 'Right', 'Home'];

const watch = new PadWatch();
const slotsEl = document.getElementById('slots')!;
const logEl = document.getElementById('log')!;
const envEl = document.getElementById('env')!;
const statusEl = document.getElementById('status')!;

let focused = document.hasFocus();
const env = (): string[] => [
  `Page: ${location.href}`,
  `Browser: ${navigator.userAgent}`,
  `Secure context: ${window.isSecureContext ? 'yes' : 'no (the browser may hide controllers here)'}`,
  `Gamepad API: ${typeof navigator.getGamepads === 'function' ? 'yes' : 'no'}`,
  `Focus: ${focused ? 'this page' : 'elsewhere'}, ${document.visibilityState}`,
  `Time: ${new Date().toISOString()}`,
];

addEventListener('focus', () => {
  focused = true;
  watch.note(performance.now(), 'page: focus');
});
addEventListener('blur', () => {
  focused = false;
  watch.note(performance.now(), 'page: lost the focus');
});
document.addEventListener('visibilitychange', () => watch.note(performance.now(), `page: ${document.visibilityState}`));
addEventListener('gamepadconnected', (e) =>
  watch.note(performance.now(), `event: gamepadconnected, index ${e.gamepad.index}, "${e.gamepad.id}"`),
);
addEventListener('gamepaddisconnected', (e) =>
  watch.note(performance.now(), `event: gamepaddisconnected, index ${e.gamepad.index}, "${e.gamepad.id}"`),
);

document.getElementById('copy')!.addEventListener('click', () => {
  const text = watch.report(performance.now(), env());
  navigator.clipboard.writeText(text).then(
    () => (statusEl.textContent = 'Copied: paste it into the issue.'),
    () => {
      statusEl.textContent = "Couldn't copy: select the log below and copy it instead.";
      logEl.textContent = text;
    },
  );
});
document.getElementById('clear')!.addEventListener('click', () => {
  watch.log.length = 0;
  statusEl.textContent = '';
});

/** One slot drawn: its name and particulars, its buttons, its axes. */
function card(place: number): string {
  const slot = watch.slots[place];
  if (!slot) return `<div class="slot"><h2>Slot ${place}: empty</h2></div>`;
  const now = performance.now();
  const buttons = Array.from(
    { length: Math.max(17, ...[...slot.down.keys()].map((i) => i + 1)) },
    (_, i) => `<span class="${slot.down.has(i) ? 'on' : ''}">${NAMES[i] ?? i}</span>`,
  ).join('');
  const axes = slot.axes
    .map(
      (v, i) => `<span>axis ${i}</span><span class="track"><i style="left:${((v + 1) / 2) * 100}%"></i></span><span>${v.toFixed(2)}</span>`,
    )
    .join('');
  const text = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<div class="slot${slot.read ? ' read' : ''}${slot.still ? ' still' : ''}">
    <h2>Slot ${place}: ${text(slot.id) || 'unnamed'}${slot.read ? ' - the game reads this one' : ''}</h2>
    <div class="meta">index ${slot.index ?? '-'} · ${text(slot.mapping) || 'no'} mapping · ${slot.connected ? 'connected' : 'not connected'} ·
      timestamp ${slot.timestamp.toFixed(1)}, moved ${Math.round(now - slot.timestampMoved)} ms ago${slot.still ? ' · <b>still, with something down</b>' : ''}</div>
    <div class="buttons">${buttons}</div>
    <div class="axes">${axes}</div>
  </div>`;
}

let shownLog = -1;
requestAnimationFrame(function frame(now) {
  watch.step(browserPadList(), now);
  envEl.textContent = env().slice(1, 5).join(' · ');
  // The slots with a pad in them (Chrome lists empty ones besides); every slot is in the report.
  const filled = watch.slots.flatMap((slot, i) => (slot ? [card(i)] : []));
  slotsEl.innerHTML = filled.length ? filled.join('') : '<p>No controllers listed yet: press a button on one.</p>';
  const last = watch.log.length ? watch.log[watch.log.length - 1] : '';
  const key = watch.log.length + last.length;
  if (key !== shownLog) {
    shownLog = key;
    logEl.textContent = watch.log.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }
  requestAnimationFrame(frame);
});
