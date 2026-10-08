/**
 * notice.ts
 *
 * A word to the player before the game starts, in the page rather than the browser's own alert box: plain HTML over
 * the black page, in the installer's colours (installer.ts). It goes with a tap or click on its button, Enter, Space or
 * Escape, or A, B or Start on a gamepad - the whole game being playable by a controller - and nothing pressed to close
 * it reaches the game behind.
 */

import { menuUp } from './pageMenu.ts';

const STYLE = `
.u5-notice { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.85); color: #aaa; font: 16px/1.5 ui-monospace, Menlo, Consolas, monospace;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  box-sizing: border-box; z-index: 20; }
.u5-notice .box { max-width: 560px; width: 100%; max-height: 100%; overflow-y: auto; background: #000;
  border: 2px solid #55f; padding: 20px 24px; box-sizing: border-box; }
.u5-notice h1 { color: #fff; font-size: 18px; margin: 0 0 10px; letter-spacing: 1px; }
.u5-notice p { margin: 0 0 16px; }
.u5-notice button { font: inherit; background: #0000aa; color: #fff; border: 2px solid #55f; padding: 8px 20px;
  cursor: pointer; }
.u5-notice button:focus-visible { outline: 2px solid #ff5; }
`;

/** The gamepad buttons that close it, in the standard mapping: A, B and Start. */
const CLOSE_BUTTONS = [0, 1, 9];

/** Show `text` under `title` until the player has read it; resolves when it is closed. */
export function showNotice(title: string, text: string, button = 'OK'): Promise<void> {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'u5-notice';
  root.innerHTML = `
    <div class="box" role="alertdialog" aria-modal="true" aria-labelledby="u5-notice-title" aria-describedby="u5-notice-text">
      <h1 id="u5-notice-title"></h1>
      <p id="u5-notice-text"></p>
      <button type="button"></button>
    </div>`;
  (root.querySelector('h1') as HTMLElement).textContent = title;
  (root.querySelector('p') as HTMLElement).textContent = text;
  const ok = root.querySelector('button') as HTMLButtonElement;
  ok.textContent = button;
  document.body.appendChild(root);
  ok.focus();

  return new Promise((resolve) => {
    let polling = 0;
    const close = (): void => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', swallow, true);
      cancelAnimationFrame(polling);
      root.remove();
      style.remove();
      resolve();
    };
    // Every key is the notice's while it shows (in the capture phase, before the game's own listeners).
    const swallow = (e: KeyboardEvent): void => {
      if (!menuUp()) e.stopPropagation();
    };
    const key = (e: KeyboardEvent): void => {
      // The crash box, over it, has the keys (pageMenu.ts).
      if (menuUp()) return;
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        if (!e.repeat) close();
      } else if (e.key === 'Tab') {
        e.preventDefault(); // the one button keeps the focus
      }
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', swallow, true);
    ok.addEventListener('click', close);
    // A gamepad button pressed while it shows, closing it as it is let go - so the game, reading the gamepad from
    // then, does not take it for a press of its own. One already held when it came counts only once let go.
    const held = new Set<string>();
    const armed = new Set<string>();
    const pressed = (): string[] =>
      (navigator.getGamepads?.() ?? []).flatMap((pad) =>
        pad ? CLOSE_BUTTONS.filter((b) => pad.buttons[b]?.pressed).map((b) => `${pad.index}:${b}`) : [],
      );
    for (const b of pressed()) held.add(b);
    const poll = (): void => {
      const now = pressed();
      if (!menuUp() && [...armed].some((b) => !now.includes(b))) return close();
      for (const b of now) if (!held.has(b)) armed.add(b);
      for (const b of [...held]) if (!now.includes(b)) held.delete(b);
      polling = requestAnimationFrame(poll);
    };
    polling = requestAnimationFrame(poll);
  });
}
