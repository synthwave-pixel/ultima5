/**
 * debug.ts
 *
 * The debug index (debug.html): links to the test pages and to the game's development starts, each carrying ?dev
 * on where this page was opened with it. The places the game can start at are named from the player's own game
 * files, where they are to hand (the port ships no game text); else by number.
 */

import { filesAtHand } from '../boot.ts';
import { GameData } from '../game/data.ts';

const params = new URLSearchParams(location.search);
const dev = params.has('dev');

/** A link's address with ?dev carried on, where this page has it. */
function withDev(href: string): string {
  if (!dev) return href;
  return href.includes('?') ? `${href}&dev` : `${href}?dev`;
}

for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-href]')) a.href = withDev(a.dataset.href!);

/** A name the files keep in capitals (most of them) in title case - "SERPENT'S HOLD" as Serpent's Hold; others as they are. */
const titled = (name: string): string =>
  name === name.toUpperCase() ? name.toLowerCase().replace(/(^|\s)(\S)/g, (_, gap: string, c: string) => gap + c.toUpperCase()) : name;

/** A place picker's choices: the towns and castles (1-32) or the dungeons (1-8), named where the files allow. */
function fill(select: HTMLSelectElement, names: string[], first: number, count: number): void {
  select.textContent = '';
  for (let n = 1; n <= count; n++) {
    const option = document.createElement('option');
    option.value = String(n);
    const name = names[first + n - 1];
    option.textContent = name ? `${n}. ${titled(name)}` : String(n);
    select.append(option);
  }
}

/** Go to the game, started at the picker's place. */
function go(select: HTMLSelectElement, kind: 'town' | 'dungeon' | 'under', under = false): void {
  location.href = withDev(`./?play&at=${kind}:${select.value}${under ? ':under' : ''}`);
}

async function start(): Promise<void> {
  const town = document.getElementById('town') as HTMLSelectElement;
  const dungeon = document.getElementById('dungeon') as HTMLSelectElement;
  document.getElementById('go-town')!.addEventListener('click', () => go(town, 'town'));
  document.getElementById('go-dungeon')!.addEventListener('click', () => go(dungeon, 'dungeon'));
  document.getElementById('go-under')!.addEventListener('click', () => go(dungeon, 'dungeon', true));
  const underworld = document.getElementById('underworld') as HTMLSelectElement;
  document.getElementById('go-underworld')!.addEventListener('click', () => go(underworld, 'under'));
  const names: string[] = [];
  try {
    const files = await filesAtHand();
    // By each place's own number (1-32 the towns and castles, 33-40 the dungeons).
    if (files) for (const l of new GameData(files).locations) if (l) names[l.id] = l.name;
  } catch {
    // No files to name them from: numbers will do.
  }
  fill(town, names, 1, 32);
  fill(dungeon, names, 33, 8);
  fill(underworld, names, 33, 8);
  const note = document.getElementById('names')!;
  note.textContent = names.length
    ? ''
    : "Install the game (the game's Scan for game files..., or ?play&autoscan=true) to see the places named.";
}

void start();
