import { describe, expect, it } from 'vitest';
import { u3Effect } from '../src/audio/chip3.ts';
import { igniteCommand } from '../src/game/cmds.ts';
import { cue, type Cue, deathCue } from '../src/game/cues.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { castCommand } from '../src/game/magic.ts';
import { T } from '../src/game/tiles.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { tileCell } from '../src/game/world.ts';
import { keys, newGame } from './helpers.ts';

/**
 * The ultima3 port's sounds where the DOS game has none of its own, or one sound served two things (game/cues.ts):
 * the Standard set plays them; the Original keeps the DOS game's own sound for the moment, or its silence.
 */
describe('the ultima3 cues', () => {
  const CUES: Cue[] = [
    'TorchIgnite',
    'Upwards',
    'Downwards',
    'MountHorse',
    'HorseWalk',
    'DeathMale',
    'DeathFemale',
    'BigDeath',
    'CombatStart',
    'Ouch',
    'Immolate',
    'DoorOpen',
    'DoorClose',
    'Alarm',
    'ForceField',
    'Invocation',
    'MonsterSpell',
    'Attack',
    'Graze',
    'Withdraw',
    'DraggedUnder',
    'Dissolve',
    'Absorbed',
  ];

  it('has a voice for every cue, none of them clipping', () => {
    for (const name of CUES) {
      const pcm = u3Effect(name);
      expect(pcm, name).not.toBeNull();
      expect(pcm!.length, name).toBeGreaterThan(1000);
      let peak = 0;
      for (const v of pcm!) peak = Math.max(peak, Math.abs(v));
      expect(peak, name).toBeLessThanOrEqual(1);
    }
  });

  /** A game whose sound records what it is asked for. */
  const listening = (set: 'standard' | 'original' | 'off') => {
    const { g } = newGame();
    const heard: string[] = [];
    g.options.soundSet = set === 'off' ? 'standard' : set;
    g.soundOff = set === 'off';
    g.sound.cue = async (name) => void heard.push(`cue:${name}`);
    const sweep = g.sound.sweep.bind(g.sound);
    g.sound.sweep = async (...a) => {
      heard.push('sweep');
      return sweep(...a);
    };
    return { g, heard };
  };

  it('plays the cue in the Standard set, the DOS sound in the Original, and nothing with sound off', async () => {
    for (const [set, want] of [
      ['standard', ['cue:Attack']],
      ['original', ['sweep']],
      ['off', []],
    ] as const) {
      const { g, heard } = listening(set);
      await cue(g, 'Attack', () => g.sound.sweep(400, 0x2ee, 5, 0x96));
      expect(heard, set).toEqual(want);
    }
    // Where the DOS game had no sound, the Original has none.
    const { g, heard } = listening('original');
    await cue(g, 'TorchIgnite');
    expect(heard).toEqual([]);
  });

  it('lights a torch with its sound', async () => {
    const { g, heard } = listening('standard');
    g.s.torches = 2;
    await igniteCommand(g);
    expect(heard).toContain('cue:TorchIgnite');
    expect(g.s.torches).toBe(1);
  });

  it('opens a door with a latch and a knock, and hears it swing shut once, four turns on', async () => {
    const { g, heard } = listening('standard');
    const p = g.p as unknown as { keys: number[] };
    journeyOnward(g);
    await enterTown(g, true);
    heard.length = 0;
    // Iolo's door is three squares south: step to it, open it, then wait.
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down, K.Space, K.Space, K.Space, K.Space, K.Space, K.Space));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(heard.filter((h) => h === 'cue:DoorOpen')).toHaveLength(1);
    expect(heard.filter((h) => h === 'cue:DoorClose')).toHaveLength(1);
    expect(heard.indexOf('cue:DoorOpen')).toBeLessThan(heard.indexOf('cue:DoorClose'));
  });

  it('unmakes furniture with Negate Matter: the spell, then the dissolve - only when a thing is unmade', async () => {
    for (const [set, chair, want] of [
      ['standard', true, 'cue:Dissolve'],
      ['original', true, 'sweep'],
      ['standard', false, null],
    ] as const) {
      const { g, heard } = listening(set);
      const s = g.s;
      const p = g.p as unknown as { keys: number[] };
      journeyOnward(g);
      await enterTown(g, true);
      s.activeMember = 0;
      s.members[0].mp = 20;
      s.mixtures[5] = 1;
      const [map, i] = tileCell(g, s.x + 1, s.y);
      map[i] = chair ? T.Chair90 : T.T44;
      heard.length = 0;
      const pitches: number[] = [];
      const record = g.sound.sweep.bind(g.sound);
      g.sound.sweep = async (...a) => {
        pitches[heard.length] = a[0];
        return record(...a);
      };
      p.keys.push(...keys('AY', K.Enter, K.Right));
      await castCommand(g);
      expect(s.mixtures[5], set).toBe(0);
      expect(map[i], set).toBe(T.T44);
      // The vanishing (the DOS game's sweep from 0x4b0), not a failed spell's lower one.
      const unmade = heard.filter((h, k) => h === 'cue:Dissolve' || (h === 'sweep' && pitches[k] === 0x4b0));
      expect(unmade, `${set} ${chair}`).toEqual(want ? [want] : []);
    }
  });

  it("gives a member's death their own voice", () => {
    expect(deathCue(0x0b)).toBe('DeathMale');
    expect(deathCue(0x0c)).toBe('DeathFemale');
  });
});
