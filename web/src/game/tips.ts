/**
 * tips.ts
 *
 * Pointers for a new player (the port's own): in the pause menu, the topics listed by their headings, each opened
 * to its text.
 * Places and shops as the game files and the code have them.
 */

import type { Game } from './game.ts';
import { choose, showText, wrap } from './menu.ts';

/** A topic: its heading, and its paragraphs. */
export interface Tip {
  topic: string;
  text: string[];
}

export const TIPS: Tip[] = [
  {
    topic: 'First steps',
    text: [
      "You wake in Iolo's hut. Shamino is badly hurt: see Healing. Talk to everyone! The journal keeps the clues.",
      "Lord British's castle lies south-east about 90 steps away from Iolo's hut. Go here first.",
      'Yew, some 30 steps north of the hut, sells reagents and arms.',
    ],
  },
  {
    topic: 'Food',
    text: [
      'Each member eats a ration at 6 in the morning, at noon and at 6 at night.',
      "Pubs sell rations. Nearest: Britain's Wayfarer Tavern, by Lord British's castle.",
      'With the Story rules hunger never hurts, but a party out of food fights less well (Rules, in Gameplay).',
    ],
  },
  {
    topic: 'Reagents',
    text: [
      'Spells are mixed from reagents, sold by apothecaries.',
      "Nearest: Yew's, north of Iolo's hut.",
      'Shops keep hours and only sell mornings and afternoons. Never at night or away from the shop.',
    ],
  },
  {
    topic: 'Healing',
    text: [
      'Healing damage comes from camping, spells, potions and healers.',
      'Healers cure and heal for gold.',
      'East Britanny by the castle offers healing.',
    ],
  },
  {
    topic: 'Camping',
    text: [
      'Camp on foot, outdoors. 6 hours or more of rest heals some hit points and restores mana.',
      'You have to wait 14 hours or more after the last rest to rest again.',
    ],
  },
  {
    topic: 'Poison',
    text: ['Spells and potions can cure poison.', 'Story and Modern rules stop poison at one hit point (Rules, in Gameplay).'],
  },
  {
    topic: 'Magic',
    text: [
      'To cast, a member needs the spell mixed, a level as high as its circle, and enough mana.',
      'Mix makes spells from reagents. With a spell chosen, the panel shows its words, reagents and cost.',
      'The Avatar and mages have the most mana, bards half; rest restores it.',
    ],
  },
  {
    topic: 'Leveling',
    text: [
      'Experience comes from battle. A new level is available at 100, 200, 400 etc up to 6400.',
      'Leveling only happens in camp: after a rest a vision may come... Not in a dungeon or an inn.',
      'A name is blue while a level waits; Ztats shows XP. Levels cap at 8.',
    ],
  },
  {
    topic: 'Talking',
    text: [
      'Everyone answers NAME and JOB. Ask of any word they use.',
      'The words you have heard are offered to say; grey ones are asked already.',
      'The journal keeps clues - mantras, words of power, shards and quest progress.',
    ],
  },
  {
    topic: 'Day and night',
    text: [
      'Shops and other NPCs keep hours: mornings and afternoons, closed shops at night.',
      'More monsters roam after midnight. Camp to get through the night quickly.',
      'After dark, 8 at night to 5 in the morning, moongates rise...',
    ],
  },
  {
    topic: 'Dungeons',
    text: [
      'Dungeons are dark: Ignite a torch. The party starts with four; guilds sell more (Paws is the nearest).',
      'Every dungeon starts sealed. Stand by the entrance and Yell the right word to open...',
    ],
  },
  {
    topic: 'Doors',
    text: ['A locked door: Jimmy it, with a key. Keys break; guilds sell them, three to a ring. A magic lock breaks every key.'],
  },
  {
    topic: 'Virtue',
    text: [
      'Karma is how virtuous the Avatar is, and it matters...',
      'It falls: striking townsfolk, opening chests or taking food in a town, some answers.',
      'It rises: alms to beggars, freeing prisoners, shrine quests.',
    ],
  },
  {
    topic: 'Travel',
    text: [
      'Horses: stables in North Britanny, Trinsic and Paws.',
      'Ships: shipwrights in East Britanny and other towns... The ship waits at the dock.',
      'A sextant can tell where the party is at night...',
    ],
  },
  {
    topic: 'The Quest',
    text: ['Lord British is lost below, and Blackthorn rules!', 'The journal tracks what is to be done...'],
  },
];

/** A topic as the panel shows it: its paragraphs wrapped to the panel, a blank line between. */
export function topicLines(tip: Tip): string[] {
  return tip.text.flatMap((para, i) => [...(i ? [''] : []), ...wrap(para)]);
}

/** The Tips: the topics listed by their headings; A opens one, B goes back to the list, and B again leaves. */
export async function tipsMenu(g: Game): Promise<void> {
  let at = 0;
  for (;;) {
    at = await choose(
      g,
      'Tips',
      TIPS.map((t) => ({ label: t.topic })),
      at,
    );
    if (at < 0) return;
    await showText(g, TIPS[at].topic, topicLines(TIPS[at]));
  }
}
