import { describe, expect, it } from 'vitest';
import { Pad } from '../src/game/io.ts';
import { commandMenu } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { enterTown } from '../src/game/town.ts';
import { setTileAt } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

/** In a towne beside a locked door, holding `torches`, `gems` and `keys`: the command menu's lines and which are greyed. */
async function menu(input: 'controller' | 'letters', torches: number, gems: number, keys: number) {
  const { g, p } = newGame();
  journeyOnward(g);
  Object.assign(g.s, { mapId: 1, level: 0, x: 15, y: 30, hour: 12 });
  await enterTown(g, true);
  const s = g.s;
  for (const a of s.actors.slice(1)) a.tile = 0;
  Object.assign(s, { x: 10, y: 10, torches, gems, keys });
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) setTileAt(g, 10 + dx, 10 + dy, 0x44);
  setTileAt(g, 10, 9, 0xb9); // a locked door: Jimmy
  g.options.input = input;
  g.commandPrompt = 'town';
  let shown: { labels: string[]; enabled: boolean[] } = { labels: [], enabled: [] };
  p.next = () => {
    shown = { labels: [...g.menuShown!.labels], enabled: [...g.menuShown!.enabled] };
    return Pad.B;
  };
  await commandMenu(g);
  const line = (start: string): { label: string; enabled: boolean } | undefined => {
    const i = shown.labels.findIndex((l) => l.startsWith(start));
    return i < 0 ? undefined : { label: shown.labels[i], enabled: shown.enabled[i] };
  };
  return line;
}

/** The command menu's lines that spend torches, gems and keys say how many the party holds (the port's). */
describe('the command menu, counting what it spends', () => {
  it('says how many torches, gems and keys: Ignite torch (x3), View a gem (x5), Pick lock (x8)', async () => {
    const line = await menu('controller', 3, 5, 8);
    expect(line('Ignite torch')?.label).toBe('Ignite torch (x3)');
    expect(line('View a gem')?.label).toBe('View a gem (x5)');
    expect(line('Pick lock')?.label).toBe('Pick lock (x8)');
  });

  it('keeps the counts with the letters, on 1988’s names', async () => {
    const line = await menu('letters', 3, 5, 8);
    expect(line('Jimmy')?.label).toBe('Jimmy (x8)');
    expect(line('Ignite torch')?.label).toBe('Ignite torch (x3)');
  });

  it('greys a line with none, and says no count', async () => {
    const line = await menu('controller', 0, 0, 0);
    expect(line('Ignite torch')).toEqual({ label: 'Ignite torch', enabled: false });
    expect(line('View a gem')).toEqual({ label: 'View a gem', enabled: false });
    expect(line('Pick lock')).toEqual({ label: 'Pick lock', enabled: false });
  });
});
