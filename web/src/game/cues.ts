/**
 * cues.ts
 *
 * The ultima3 port's sounds where the DOS game has none of its own, or where one of its sounds served two things:
 * a torch lit, a ladder climbed, a horse mounted and ridden, a member's death and the party's, a fight begun, a
 * cactus's prick, a fire field, a door opened and swinging shut, the guards called, an electric field, the Codex's voice; a
 * monster's own blow and spell, where the party's swing and arrows sounded the same; and a blow that grazes, one
 * leaving the field and one dragged under, and magic undone - a ring lost, one absorbed by the Mirror of Truth, a thing
 * unmade by Negate Matter - where the DOS game sounded its vanishing for them all. The Standard sound set plays
 * them (audio/chip3.ts); the Original set keeps the DOS game's own - its sound where it had one, silence where
 * it had none.
 */

import type { Game } from './game.ts';

export type Cue =
  | 'TorchIgnite'
  | 'Upwards'
  | 'Downwards'
  | 'MountHorse'
  | 'HorseWalk'
  | 'DeathMale'
  | 'DeathFemale'
  | 'BigDeath'
  | 'CombatStart'
  | 'Ouch'
  | 'Immolate'
  | 'DoorOpen'
  | 'DoorClose'
  | 'Alarm'
  | 'ForceField'
  | 'Invocation'
  | 'MonsterSpell'
  | 'Attack'
  | 'Graze'
  | 'Withdraw'
  | 'DraggedUnder'
  | 'Dissolve'
  | 'Absorbed';

/**
 * Sound cue `name` in the Standard set; in the Original, the DOS game's own sound for the moment (`original`), or
 * none. Waits as an effect does: a moment at most.
 */
export async function cue(g: Game, name: Cue, original?: () => Promise<void>, whole = false): Promise<void> {
  if (g.soundOff) return;
  if (g.options.soundSet === 'standard' && g.sound.cue) return g.sound.cue(name, whole);
  if (original) return original();
}

/** A member's death, in their own voice: a man's falls lower than a woman's. */
export const deathCue = (gender: number): Cue => (gender === 0x0c ? 'DeathFemale' : 'DeathMale');
