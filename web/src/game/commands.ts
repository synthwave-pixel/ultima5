/**
 * commands.ts
 *
 * The command letters (u5d 3000.c ULTIMA_3178_ProcessCommand), sent on to
 * the modules that carry them out. A command returns 0 when no turn
 * passes, 1 when one does, 2 after talking (the town then lets the NPC
 * act), and 3 to read another key without a new prompt.
 */

import { drawVitals } from './frame.ts';
import { Game } from './game.ts';
import { HARPSICHORD, K, SAVE_NOW } from './io.ts';
import { attackOutdoors, enterCommand } from './outdoors.ts';
import { Status } from './save.ts';
import { talkCommand } from './talk.ts';
import { attackInTown, klimbInTown } from './town.ts';
import {
  boardCommand,
  fireCommand,
  holeUpInBed,
  igniteCommand,
  klimbOutdoors,
  newOrderCommand,
  pushCommand,
  xitCommand,
  yellCommand,
} from './cmds.ts';
import { getCommand, jimmyCommand, openCommand, searchCommand } from './items.ts';
import { lookCommand, viewGem } from './look.ts';
import { saveCommand } from './storage.ts';
import { tileAt } from './world.ts';
import { readyCommand, ztatsCommand } from './zstats.ts';
import { T } from './tiles.ts';
import { holeUpCommand } from './combat.ts';
import { castCommand, mixCommand, useCommand } from './magic.ts';
import { attackInDungeon, dungeonView, klimbInDungeon, lookInDungeon } from './dungeon.ts';

export type Handler = (g: Game) => Promise<number>;

/** Commands filled in by later modules, by letter. */
export const handlers: Partial<Record<string, Handler>> = {};

/** A command; one backed out of at its prompt spends no turn (the port's, from the ultima3 port). */
export async function processCommand(g: Game, key: number): Promise<number> {
  g.cancelled = false;
  let turn: number;
  try {
    turn = await command(g, key);
  } finally {
    g.bumpDir = 0;
    g.bumpWho = -1;
    // A spell chosen from the menu that the command never came to cast (castCommand takes it) is not the next one's.
    g.castPreset = null;
    g.castOn = null;
  }
  if (g.cancelled) {
    g.cancelled = false;
    return 0;
  }
  return turn;
}

/** ULTIMA_3178_ProcessCommand. */
async function command(g: Game, key: number): Promise<number> {
  const s = g.s;
  const c = String.fromCharCode(key);
  const h = handlers[c];
  switch (key) {
    case K.CtrlB:
      g.say(0xa110); // "Buffer O"
      g.keyBuffer = !g.keyBuffer;
      g.say(g.keyBuffer ? 0xa11a : 0xa11e); // "ff\n" : "n\n"
      return 0;
    case K.Space:
      if (s.mapId === 0 && s.sailing !== 0) {
        g.say(0xa122); // "Sheets in irons!\n"
        s.sailing = 0;
      } else {
        g.text.moving = true; // passed again, it folds with a count as a move does: "Pass (x5)" (text.ts)
        g.say(0xa134); // "Pass\n"
      }
      return 1;
    case 0x41: // Attack
      if (s.mapId === 0) return attackOutdoors(g);
      if (s.mapId < 0x21) return attackInTown(g);
      return attackInDungeon(g);
    case 0x42: // Board
      return boardCommand(g);
    case 0x43: // Cast
      g.say(0xa142); // "Cast...\n"
      return castCommand(g);
    case 0x44:
      g.say(0xa14c); // "D-What?\n"
      return 0;
    case 0x46: // Fire
      return fireCommand(g);
    case 0x47: // Get
      if (s.mapId < 0x21) g.say(0xa16a); // "Get-"
      return getCommand(g);
    case 0x48: // Hole up
      if (s.mapId === 0 || s.mapId > 0x20) return holeUpCommand(g);
      g.say(0xa170); // "Hole up- "
      if (tileAt(g, s.x, s.y) !== T.Bed)
        g.say(0xa17a); // "Only in bed!\n"
      else await holeUpInBed(g);
      return 1;
    case 0x49: // Ignite
      return igniteCommand(g);
    case 0x4a: // Jimmy
      g.say(0xa198); // "Jimmy-"
      return jimmyCommand(g);
    case 0x4c: // Look
      g.say(0xa1a8); // "Look"
      if (g.inDungeon) {
        g.say(0xa1ae); // "...\n"
        return lookInDungeon(g);
      }
      g.printChar('-');
      return lookCommand(g);
    case 0x4e: // New order
      return newOrderCommand(g);
    case 0x4f: // Open
      g.say(0xa1ce); // "Open-"
      return openCommand(g);
    case 0x50: // Push
      return pushCommand(g);
    case 0x51: // Quit (and save)
      return saveCommand(g);
    case HARPSICHORD: {
      // Play, or a walk into the harpsichord: its keyboard (harpsichord.ts).
      const { playHarpsichord } = await import('./harpsichord.ts');
      return playHarpsichord(g);
    }
    case SAVE_NOW: // the Pause menu's Save game
      return saveCommand(g, true);
    case 0x52: // Ready
      return readyCommand(g);
    case 0x5a: // Z-stats
      return ztatsCommand(g);
    case 0x53: // Search
      g.say(s.mapId < 0x21 ? 0xa1fc : 0xa204); // "Search-" : "Search...\n"
      return searchCommand(g);
    case 0x56: // View a gem
      g.say(0xa258); // "View a gem!\n"
      if (s.gems !== 0) {
        s.gems--;
        if (s.mapId < 0x21) await viewGem(g, s.x, s.y);
        else await dungeonView(g);
        return 1;
      }
      g.say(0xa266); // "You have none!\n"
      return 1;
    case 0x58: // X-it
      return xitCommand(g);
    case 0x59: // Yell
      return yellCommand(g);
    case 0x45: // Enter
      if (s.mapId === 0) return enterCommand(g);
      g.say(0xa156); // "Enter what?\n"
      return 1;
    case 0x4b: // Klimb
      if (s.mapId === 0) return klimbOutdoors(g);
      if (s.mapId < 0x21) return klimbInTown(g);
      return klimbInDungeon(g);
    case 0x54: // Talk
      if (s.mapId === 0) {
        g.say(0xa210); // "Talk-"
        const { selectDirection } = await import('./input.ts');
        if (await selectDirection(g)) g.say(0xa216); // "Funny, no response!\n"
        return 1;
      }
      if (s.mapId > 0x20) {
        g.say(0xa22c); // "Talk-Funny, no response!\n"
        return 1;
      }
      g.say(0xa246); // "Talk-"
      return (await talkCommand(g)) !== 0 ? 2 : 1;
    case 0x4d: // Mix
      g.say(0xa1b4); // "Mix Reagents\n\n"
      return mixCommand(g);
    case 0x55: // Use
      g.say(0xa24c); // "Use item\n\n"
      return useCommand(g);
    case 0x57:
      g.say(0xa276); // "W-What?\n"
      return 0;
    default:
      if (h) return h(g);
      g.say(0xa298); // "What?\n"
      return 0;
  }
}

/** ULTIMA_4080: 1-6 make that member the active player; 0 none. */
export async function setActivePlayer(g: Game, key: number): Promise<number> {
  const s = g.s;
  const i = key - 0x31;
  g.say(0xa396); // "Set Active Plr:\n"
  if (key === 0x30) {
    g.say(0xa3a8); // "None!\n"
    s.activeMember = 0xff;
    drawVitals(g);
    return 0;
  }
  if (s.partySize > i && s.members[i].status !== Status.Dead && s.members[i].status !== Status.Sleeping) {
    s.activeMember = i;
    g.print(s.members[i].name);
    g.printChar('\n');
    drawVitals(g);
    return 0;
  }
  g.say(0xa3b0); // "Invalid!\n"
  return 1;
}
