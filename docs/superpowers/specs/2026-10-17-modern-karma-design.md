# Modern karma: The Path in four pools

*Design spec, 17 October 2026. For the Modern rules only.*

## Goal

The 1988 game keeps one hidden number, karma (0–99), moved by a handful of
deeds, several of them repeatable for free (Ava's +5 for five gold, Fenelon's
+5 for a question), and read by three gates: Gruman's mantra (50), Annon's Word
(75), a healer's resurrection without lost experience (98). The Modern rules
replace how karma is earned with a fuller system in the spirit of later RPGs
(Knights of the Old Republic, Fallout 3), without karma farming, and without
adding to or changing the game's own text.

Success: every part of play - talk, conduct in towns, fighting, the quest -
counts, each in proportion; nothing can be farmed by going back to the same
person or repeating the same act; harm done to the innocent is felt; the
player can see where they stand (The Path) without seeing a number.

## Scope

- **Two karmas, side by side, always.** 1988's karma (the save's byte) goes
  on by 1988's own code under every rules, unchanged. The Modern karma (the
  four pools) is kept at the same time, by the deed table, under every rules.
  Nothing converts one into the other.
- **The rules choose which one the game reads.** Under the Modern rules the
  gates (Gruman 50, Annon 75, the healer's 98), Lord British's and the camp's
  old man's messages, The Path and Ctrl-K read the Modern karma; under Story
  and Classic, 1988's, exactly as before. Switching rules switches the
  reader; both stay right because both were kept all along.
- **No new text from the game's files is altered.** Choices are read from the
  conversations as they stand; the port's own lines are the log's feedback
  and The Path's cards.
- Not in scope: per-virtue meters (considered, set aside: virtue is a tag on
  each deed, not a meter); changing any gate's threshold; new conversations.

## The model

### Four pools, each 0–99

| Pool | On The Path | Fed by | Behaviour |
|---|---|---|---|
| Words | In word | choices in conversation | counted once per choice; rises; only betrayal lowers it |
| Deeds | In deed | actions in the world, repeating | bounces |
| Battle | In battle | fights won and fled; harm in a fight | bounces |
| Quest | In the quest | the quest's milestones | rises (a mantra betrayed aside) |

**Starting values.** A new game: every pool 75, as 1988's karma begins. A
save from before the Modern karma (1988's karma only): the pools begin afresh
at 75 each - not copied from 1988's karma, which goes on as it was.

### Overall karma

```
modern = round(0.30 Words + 0.30 Deeds + 0.25 Quest + 0.15 Battle)
```

then capped by the weakest pool: any pool below 25 caps it at 74 (Seeker at
best); below 10, at 49 (Misguided).

### Cheats

- **Renew virtue** raises both karmas to at least 75: 1988's, and each pool.
- Under the **Modern rules only**, the cheats that give for nothing cost
  Deeds (tagged Honesty): Full restore −1, Food −1, Gold −2, Gems/keys/torches
  −2, Reagents −2, Glass swords −2. Story and Classic charge nothing (a
  player may switch to Story to cheat freely; so be it).
- A fight ended by **Slay every foe**, or with **Auto kill** on, earns no
  Battle karma. The regalia given by **The quest's items** earn no Quest
  karma (it sets them without their being found). A dungeon reached by
  **Go to...** counts as entered.

### Virtue tags

Every deed names one of the eight virtues. The log names it ("Thy Compassion
grows."); the pools keep a tally of virtue gained per pool, which The Path's
cards use to say which virtue the party has shown most in each.

## The deeds

Values are deltas to their pool. "Once" means once per game, kept in the save;
a question's choice is counted at the first answer only - asking again, or
answering otherwise later, counts nothing. Ids `f:t` are the TLK file (0
TOWNE, 1 DWELLING, 2 CASTLE, 3 KEEP) and talk number; `Lxx` the question's
label. Entries marked † were garbled in the dump the catalog was made from:
their labels and answers are to be confirmed against the raw script before
they are wired.

### Words

**Dilemmas** (each answer grows Words, tagged with a different virtue):

| Who | Question | Answer → | Other answer → |
|---|---|---|---|
| Sir Sean 3:26 L91 | Art thou afraid to journey into Evil's abode? | y → +2 Honesty | n → +2 Valor |
| Lady Hayden 3:14 L91 | Art thou afraid? | y → +2 Honesty | n → +2 Valor |
| Wartow 0:48 L94 | Art thou proud of this fact? | y → +2 Honesty | n → +3 Humility |
| Wartow 0:48 L92 | Dost thou hate the tyrant Blackthorn? | n → +3 Humility | y → +2 Justice |
| Zachariah 0:1 L91 | Art thou the Avatar of legend? | y → +1 Honesty | n → +1 Humility |
| Gruman 0:34 L92 | For a just and honorable cause I trust? | y → +2 Honor | n → +2 Honesty |
| Anthony 1:5 L93/L94 | (Blackthorn's laws) the truth / the comfort | truth → +2 Honesty | comfort → +2 Compassion |
| Greymarch 0:36 L92 | Is he (Froed) well? | the truth (Froed met: y; not met: n) → +2 Honesty | "y" without having met Froed → +1 Compassion |
| Greymarch 0:36 L94 | Surely thou wilt let me repay thee? | decline → +2 Humility | accept → 0 (the Sceptre's hint) |
| Toede 3:21 L92 | Wilt thou help me escape? | y → +2 Compassion | other → +2 Justice |
| Drudgeworth 2:6 L93† | Ye will let me out? | y → +2 Compassion | other → +2 Justice |
| Captain Johne 3:1 L92 | Might I join thee? | y → +3 Compassion | other → +1 Justice |
| Terrance 0:9 L93 | Dost thou intend to turn me in? | n → +2 Compassion | other → 0 (1988's −1 dropped) |
| Justin 0:7 L93 | Pay 3 gold for the mutton? | y → +2 Justice | other → 0 |
| Margaret 2:4 L94† | Pay 5 crowns to offset the cost? | y → +2 Justice | other → 0 (1988's −1 dropped) |
| Terrance 0:9 L92 | Dost thou have enough to eat? | yes → +1 Sacrifice | n → 0 |
| Fiona 0:26 L92 | Art thou in dire need of food? | no → +1 Sacrifice | y → 0 |
| Foulwell 2:16 L93 | (the child in the vat) Like it? | other (the guards come) → +2 Valor | y → 0 |

**Single choices** (once):

| Who | Choice | Words |
|---|---|---|
| Vigil 2:24 L93 | "Canst thou prove it?" → n | +3 Honesty |
| Jeremy 0:20 L91 | bail for his brother (30 gold) | +3 Compassion |
| Jeremy 0:20 L93 | pays 50 gold for the keys | +2 Justice |
| Ava 2:31 L92† | the offering (5 gold) | +2 Spirituality (1988's +5 dropped) |
| Fenelon 0:28 L91† | asks after the child | +2 Compassion (1988's +5 dropped) |
| Judge Dryden 0:19 L93 | pleads for a prisoner | +2 Compassion |
| Lord Shalineth 3:12 L91 | swears not to use the name foolishly | +2 Honor |
| Shirita 0:42 L91 | walks a humble path | +2 Humility |
| Malifora 0:2 L91 | pays her 15 gold | +1 Sacrifice |
| Delwyn 0:30 L94/L91 | gives him 3 gold (either question) | +1 Sacrifice |
| Froed 0:37 L95† | takes his message | +1 Honor |
| Greymarch 0:36 L93 | the message delivered ("skar"), once Froed's taken | +2 Honor |

**Families** (each member once; the family's total capped):

| Family | Members | Each | Cap |
|---|---|---|---|
| Honest dissent (Justice) | "n" to supporting Blackthorn: Lady Sahra 0:29 L91, Tetsuo 0:44 L91, Charlotte 1:6 L91, Sir Arbuthnot 1:15 L91, Lady Tessa 3:3 L91, Toede 3:21 L91 | +1 | +3 |
| Faith (Spirituality) | Lord British lives: Jerone 0:21 L91, Fiona 0:26 L91, Tomoka 0:41 L91 | +1 | +2 |
| Loyalty (Honor) | Lord British the rightful ruler: Greyson 0:6 L91, Thorne 0:16 L92, Wartow 0:48 L91, Camile 2:18 L93†, Landon 0:18 L91† | +1 | +2 |
| Set things right (Valor) | Jaana 0:35 L91, Mariah 3:27 L91, Dupre 3:30 L92, Captain Johne 3:1 L91, Barbra 3:19 L91, Saul 0:40 L91, Kindor 0:39 L91, Chamfort 0:17 L92, Landon 0:18 L95, Thentis 2:21 L97, Joshua 2:22 L92† | +1 | +3 |

**Betrayal** (counted once, the only Words penalties):

| Who | Choice | Words |
|---|---|---|
| Flain 0:38 L94 | names Sindar, who will die for it | −15 Justice (refusing: +2 Honor) |
| Thrud 3:8 L93 | gives the Resistance's password | −10 Honor (refusing: +3 Honor) |
| Jeremy 0:20 L93 | refuses to pay for the keys taken | −5 Justice (1988's −3 dropped) |

**Neutral** (the plot asks it; no karma): the infiltration of the Oppression
(Tactus 0:25, Judge Dryden 0:19 L94, Flain 0:38 L93, Elistaria 3:9), lies to
Blackthorn and his spy (2:10, Saduj 2:7), and Gruman's every answer but L92.

### Deeds

| Deed | Deeds | Virtue | Counts |
|---|---|---|---|
| Alms to a beggar | +3 | Compassion | each beggar once per game day |
| Freeing a prisoner | +5 | Compassion | each prisoner |
| Gold offered at a shrine | +1 per 100 gold, at most +5 a visit | Sacrifice | each offering |
| Paying a healer to raise a companion | +2 | Sacrifice | each time |
| Stealing food, picking crops | −2 | Honesty | each time |
| Opening a chest in a towne | −4 | Justice | each time |
| Destroying a door with a cannon | −4 | Justice | each time |
| One of the place killed by a cannon's shot | −30, and Battle −20 | Compassion | each time |
| Attacking a townsperson | −10 | Compassion | each time |
| Killing a townsperson | −30 | Compassion | each time |
| Murdering a helpless one (stocks, bed) | −50 | Compassion | each time |

(The party's theft in this game is the food, the crops and the chests above:
there is no other stealing; "pickpocketing" is a thief robbing the party.)
1988's own karma changes all go on, in 1988's karma; the Modern karma counts
only what this table says.

### Battle

| Event | Battle | Virtue |
|---|---|---|
| A fight won | +1 | Honor |
| A fight won against foes that outnumbered the party | +2 | Valor |
| Leaving a fight with foes still standing | −3 | Honor |
| Killing a townsperson in a fight | −20 | Honor |
| Murdering a helpless one | −30 | Honor |

### Quest

| Milestone | Quest | Virtue |
|---|---|---|
| A shrine's quest completed (each of 8) | +4 | the shrine's virtue |
| A Shadowlord destroyed (each of 3) | +5 | Valor |
| A dungeon first entered (each of 8) | +1 | Valor |
| A ruined shrine restored (each) | +2 | Spirituality |
| A piece of Lord British's regalia recovered (each of 3) | +2 | Honor |
| A mantra given away under Blackthorn's interrogation | −15 | Spirituality |

## The Path

The journal's line is unchanged: the overall tier ("The Path        Wise").
Under Modern, A on it opens four lines, each its pool's tier, never a number:

```
In word              Wise
In deed            Seeker
In battle            Wise
In the quest  Enlightened
```

Each card says what the tier means, and the virtue shown most in that pool
("In deed: Seeker. Thy Compassion is known; thy hand has strayed."); Y gives
how the pool is walked. Under Story and Classic The Path stays as it is (one
line, no page).

## Feedback

- A change of 3 or more in a pool, and every fall, prints one line in the log,
  in the game's voice and naming the virtue: "Thy Compassion grows.", "Thy
  Honor is tarnished.", "Thou hast strayed from the Path." Smaller rises are
  silent; they show in The Path.
- When the overall tier or a pool's tier changes, the log also says "Journal
  updated", as a clue heard does.

## Architecture

- **`web/src/game/modernKarma.ts`** (new): the deed table (ids, pool, delta,
  virtue, how it counts, family), `deed(g, id, extra?)` - the one entry
  point - and `combine(g)`, which writes the karma byte. Pure functions for the
  arithmetic, so the balance is tested without a game.
- **State** on `Game` (`g.path`): the four pools, the virtue tallies per pool,
  the deeds counted (ids, families' totals), and the day each beggar was last
  given to. Saved as `path` in `SaveData` (storage.ts), absent from older
  saves (initialised from karma on first use), carried in an export.
- **Hooks**, each one line calling `deed()`, Modern only:
  - talk.ts: a question's answer (label and word) and a keyword's answer,
    looked up in the table by `f:t:Lxx:answer`; the 1988 karma codes (0x89,
    0x8a) and the beggar bonus in `payGold` skipped under Modern.
  - items.ts: freeing a prisoner, a chest opened in a towne, food and crops.
  - town.ts: attacking and murdering a townsperson.
  - combat.ts: a fight won (with the party's and the foes' numbers), a fight
    left with foes standing, a townsperson killed in a fight.
  - shops.ts: a healer's paid resurrection; the pub's line skipped.
  - shrine.ts, cmds.ts: an offering, a quest done, a ruined shrine restored.
  - story.ts: a mantra given away; magic.ts (the shards): a Shadowlord
    destroyed; dungeon.ts: a dungeon first entered; items.ts: regalia taken.
  - pickpocketing and stealing, where they are made.
- **The Path** (journal.ts): the pool page under Modern.
- **Feedback**: `deed()` prints the line and compares tiers before and after.

## Testing

- The arithmetic: combine's weights and the weakest-pool caps; the start
  from karma; rules switched both ways (the difference spread, the byte
  honoured).
- Each pool's rules: once-only choices (the second answer counts nothing),
  family caps, the beggar's day, the bouncing pools, murder hitting both.
- The table against the game's files: every Words entry's id, label and
  answer exists in the player's TLK files (the test reads them), so a
  mistyped or garbled reference fails.
- Conversations end to end with a controller (as the Greyson and Jimmy tests
  do): a dilemma's two answers, a betrayal, Ava's offering counted once.
- Classic and Story unchanged: 1988's karma codes still apply there, and no
  `path` state is made.
- The Path's page and cards, and the feedback lines.

## Open questions settled in review

- One scale vs per-virtue meters: pools, with virtues as tags.
- Silent vs announced: a line for meaningful changes, "Journal updated" at a
  tier change.
- What counts: actions, and the answers players already give.
- Bonuses over penalties: penalties only for active harm and betrayal;
  fleeing a fight −3.
- Murder hits Deeds and Battle both.
