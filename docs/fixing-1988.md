# Fixing the 1988 game

The port's rules come from [u5d](https://github.com/wonst719/u5d), the
community's reconstruction of the MS-DOS *Ultima V* (v1.16, the version
sold digitally today). Following the DOS code closely meant following its
mistakes too. Some were known; the biggest was not. This is how they were
found, and how the original Apple II release - the version Origin wrote
first - settled what the game was meant to do.

## Armour that did nothing

It started with a doubt. The port had carried, from u5d, a fix that made
armour count "as the manual says", and a list of what the port changes
from 1988 included "armour did not count in the DOS game". It rested on
that one comment. The question came back: *can you validate that?* It is
a big claim. Players had spent their gold on plate for nearly forty years.

**What the DOS game does.** Checked in the machine code of a bought copy,
not only the decompilation, there are two faults, either one enough on
its own:

- **The damage formula never asks about armour.** When a member is hit,
  COMBAT.OVL subtracts a random 1 to *n*, where *n* is byte 0x18 of the
  member's record. That byte is 7 for every character in the game's start
  data, and nothing in the game ever writes it. Naked or in Mystic Armour,
  everyone soaks 1 to 7.
- **The routine that totals armour always returns nothing.** At
  ULTIMA.EXE offset 0x6DA8, the check for "is something worn in this
  slot?" was probably written `if (item > -1)`. The 1988 compiler made it
  an unsigned comparison against 65535, `cmp si,0FFFFh / jbe`, which an
  item number from 0 to 255 can never pass. So the total is 0 for
  everyone. Combat never asks for it anyway.

The Protection spell (In Sanct) adds its bonus inside that same unused
routine, so it did nothing either. u5d had flagged both faults in its
code. As far as we could find, no guide, wiki or FAQ ever told players.
In 2024 a player on the GOG forum noticed that heavy armour and none took
"about the same damage". They were told the armour's soak is random,
accepted it, and the bug went unnoticed again.

**What was meant.** The manual, *The Book of Lore*, grades body armour
from cloth's "limited protection" to plate's "most complete protection
possible". Prima's guide lists a defence for every piece: cloth 1,
leather 2, chain 5, plate 7, Mystic Armour 10, shields 2 to 5. Those
numbers are in the DOS game's own data, item for item. Every version
shipped the right table; the DOS game just never read it.

**The Apple II settles it.** The original disks are ProDOS volumes. To
read them, a small ProDOS reader and a 6502 disassembler were written for
the purpose. The combat module, `MAIN.COMBAT`, sits on the Dungeon and
Underworld disks and loads at $8000. Its defence table is copied lower in
memory as the game starts, which is why searching for it where it is
stored found nothing. Following the "grazed!" message back led to the
damage routine at $98E3, and from there to a routine at $982B that walks
the six equipment slots, adds each item's defence from the table, and
adds 2 more for Protection. The blow is a random 1 to the weapon's value,
less a random 1 to that armour total; at zero or less, the target is
grazed. The design, working, all along.

**What it meant for players.** The bug did not simply make the DOS game
harder. It flattened it. A mage in cloth (armour 1) soaked about 4 in
the DOS game where the design gave 1, so the lightly armoured had it
easier. A fighter in plate, iron helm and large shield (armour 13) soaked
about 4 where the design gave about 7. A party in the best gear (22)
soaked about 4 where the design gave about 11. Money spent on armour was
wasted, and the front line suffered most just when it should have been
safest.

**The fix, and a fix of the fix.** The port first used u5d's own repair:
the record's 7 *plus* the armour total. That turned out to be wrong too.
It gave everyone a hidden extra 1 to 7 that neither the design nor the
Apple II has, so the port was easier than either original. Now a
member's defence is their armour alone, with Protection's 2, as the
Apple II reckons it. The Story and Modern rules add a cushion before the
roll (+10 and +3); Classic adds nothing. Tests hold the fix: each fails if
the 1988 behaviour is put back.

(The FM Towns release, u5d notes, compiled that comparison the other way,
so it at least totalled the armour correctly.)

## A creature's blow, never rolled

Reading the damage code closely turned up a second difference. In the
DOS game, a creature's blow is its whole attack value, every time: a
dragon always hits for 30, a daemon or gargoyle for 20. Only the party's
blows are rolled. The Apple II rolls both, with the same "random 1 to
*n*" routine ($A41D) it uses for armour. So PC creatures hit about twice
as hard as designed. Combined with the armour bug, a DOS party took
full-strength hits with the same small soak whatever it wore. It explains a good deal
of the old advice: that level 8 is about the only way to survive, and to
flee dragons early.

The port rolls a creature's blow as the Apple II does. With the Story
and Modern rules, the heaviest hitters (gargoyles, daemons and dragons)
roll half their attack to all of it, so that a party just begun cannot
outlast one. That part is the port's own balance, not a fix.

## Two bugs with one cause

The Apple II code also showed that two more DOS bugs were the DOS game's
alone. Both pass a member's number in the party where their place in the
fight is meant, and the two only differ once someone ahead of the member
has fallen:

- **The Glass Sword never shattered.** The DOS game shattered it in the
  hand of whoever stood at the wielder's number in the party - the wrong
  member, once anyone ahead of the wielder had fallen - so the wielder
  kept a sure kill at every blow, for ever. The Apple II looks up the
  wielder's party slot from their place in the fight, and it shatters as
  it should.
- **The sleep potion slept the wrong one.** In a fight, the DOS game put
  to sleep whoever stood at the drinker's number: another member, or a
  foe. The Apple II passes the drinker.

The port fixes both, as the Apple II has them.

## Summoning and possession, side by side

Comparing the creatures' magic in the two versions settled several
smaller questions. All 48 creatures' abilities match; their numbers
match too, except the mimic's armour (8 on the Apple II, 3 in DOS).
Possession works the same way: a random place in the fight is picked,
the target resists on intelligence against intelligence, a daemon goes
into the one it possesses, and nothing wears it off. But:

- **A summoner gates in a daemon 1 turn in 32 on the Apple II** (`AND
  #$1F` at $A1E2), where the DOS game has 1 in 8. Daemon and dragon
  fights were meant to be quieter.
- **When nobody unpossessed is left standing**, or a Shadowlord is slain,
  the possessed "pass out" and are freed (a Shadowlord fleeing the
  field does it too). The Apple II frees every one
  at once ($A546); the DOS game frees only the first.

The Classic rules take the Apple II's way in each. The Story and Modern
rules keep the DOS game's busier 1 in 8 - what a fight can breed is bounded
for them in other ways - and its pass-out, and ease possession their own way - a daemon
thrown out of the one it possessed comes back onto the field weakened, and
with the Story rules one gated in during the fight comes back with a
single hit point.

## A fighter with no figure

Setting a new fighter down - a creature summoned or divided, a room's
foes - takes a place in the fight and then a figure from the 32 on the
field. The DOS game (`ULTIMA_6506`) takes the place first; with no
figure free - corpses, chests, loot and fields hold them - it says the
fighter was not placed, but leaves the place taken: a live monster with
full hit points, its figure the one the place last had. That phantom
fought, and moved whatever figure it borrowed - a party member's, even -
until it was struck down. A field filled by gargoyles dividing without
bound, as the Classic rules let them, found it. The port gives the
place back.

## Random numbers that were not

While tuning how often daemons are summoned, a new roll of 1 in 6 came
out *less* often than the old 1 in 8. The cause was the game's random
number generator. The DOS game keeps one 16-bit number and steps it the
same way each time: add 0x9248, rotate right 3, xor 0x9248, add 0x11. It
has only 65,536 states, and they fall into seven loops, the longest
47,343 steps, others only 82 and 40, and one a single number repeated for
ever. The game seeds it from the clock, so a few games started
in a loop where every roll came round again every 40 or 82 rolls (123
seeds of the 65,536, about one game in 530). Worse,
each roll largely decides the next. A random square in a fight, where a
daemon is gated in or a creature teleports, could only ever land on 63
of the field's 121 squares.

The port uses the browser's own random numbers. Its tests use a seeded
stand-in, so that every test plays out the same each time. One thing
keeps the 1988 numbers on purpose: where a Shadowlord blights a towne,
its trees still fall the same way each day.

## Kept as they were

Not every oddity is a bug, and the port keeps what is merely 1988's way:

- **In Doom, armour counts only with Mystic Armour on.** Both versions
  have it.
- **The jewel shield guards nothing, and the jewelled sword does no
  harm.** The shield's defence is 0 on the Apple II as well as in DOS, and
  the DOS game deals nothing with the sword: treasure, not gear.
- **A lone daemon that possesses the last member standing forfeits the
  fight** with the Classic rules. It goes into the member, the member
  passes out, no foe is left, and the battle is won, as in 1988. With the
  Story and Modern rules, the daemon is cast back out and the fight goes
  on.
- **A chest, or the loot it spills, stands in the way in a fight** until
  someone deals with it, where a body is walked over: the square test
  (`COMBAT_0000`) lets three things be stood on - the fields, a fallen
  member and a corpse - and nothing else that shows. The Classic rules
  keep it; with the Story and Modern rules loot is stepped over too.
- **What cannot be seen does not block.** An invisible ghost or a corpser
  under the ground can be walked onto, and reappears where it is; some
  rooms set their creatures down together on one square (a swarm of bats
  out of one crack), as the data has it.
- **A room's trigger raises its walls where it will.** Wrong's trap shuts
  the way out behind the party, a hidden door in it - wall raised under
  anyone standing there, who can still step out.

## How it was checked

- **u5d**, the reconstructed source of the DOS game, which flagged the
  armour faults in its code.
- **The DOS machine code** of a bought copy (`ULTIMA.EXE`, `COMBAT.OVL`),
  to confirm each fault rather than trust the reconstruction.
- **The Apple II disks**, read with a ProDOS reader and a 6502
  disassembler written for the purpose.
- **The manual**, *The Book of Lore*, and the published armour values.
- **The players**: the GOG forum thread where the symptom was noticed in
  2024, the Ultima Codex, and the GameFAQs guides, whose advice reads
  like players working around these bugs without knowing it.
- **A simulation** (`web/tools/sim`), playing thousands of fights for
  parties at four stages of the game against creatures from rats to
  dragons, to measure what each change did before it was kept.
- **Tests** for every fix, each one checked to fail when the 1988
  behaviour is put back.
- **Thousands of careless fights** (`web/tools/sim/fuzz.ts`) with random
  rules, parties, arenas and rooms, checking after every key what must
  always hold of a fight - which is how the phantom fighter was found.
- **The game played through**, start to proclamation, by a bot with
  nothing but a controller's buttons, along the GameFAQs walkthrough.
