/**
 * keywordLabels.ts
 *
 * The word the Say list labels a townsman's keyword with, where no rule can tell (menu.ts sayMenu, words.ts
 * forStub). A keyword is a stub ("THIN"), and any word heard that begins with it says it, as typing did in 1988; the
 * list shows one of them. The townsman's own word for it decides most (tools/talk/keywords.ts reads every
 * conversation, and everything printed to be read, for the words that fit each keyword). These are the rest - a
 * townsman who says two different words that fit, or none - each read by hand against the townsman's conversation
 * and the keyword's answer: the word that names what the answer is about, and that leads the player to ask it. It
 * labels the keyword once a form of it has been heard; until then the rule does. Every word heard that fits still
 * says the keyword, as ever. tests/keywordlabels.test.ts fails on any such keyword without one here.
 *
 * Keyed by the conversation - the file (0 TOWNE, 1 DWELLING, 2 CASTLE, 3 KEEP .TLK) and its number there - and the
 * keyword as the script writes it.
 */

export const KEYWORD_LABELS: Readonly<Record<string, string>> = {
  // Zachariah (Moonglow), TOWNE.TLK: SIGN/PLAN's answer 'Comets have come!' leads to EVIL/COME, answered about the three comets.
  '0:1:COME': 'comet',
  // Malifora (Moonglow), TOWNE.TLK: SEE shares its answer with KEEN/THIN, all from 'I can see many things beyond thy keen!'; 'seeketh' is only in the answer itself.
  '0:2:SEE': 'see',
  // Malik (Moonglow), TOWNE.TLK: 'I know she'd like to see thee' is the very lead to the talk of his mother; 'she' would read cleaner but serves the same.
  '0:3:SHE': "she'd",
  // Eb (Britain), TOWNE.TLK: DIRT's answer 'Our customers are messy!' leads to MESS.
  '0:8:MESS': 'messy',
  // Telila (Britain), TOWNE.TLK: BARD's answer '...found near the fountains!' leads to FOUN, answered 'At the centre of towne!'.
  '0:10:FOUN': 'fountains',
  // Trian (Jhelom), TOWNE.TLK: SONG's answer 'Songs of valor, of course!' leads to VAL; 'valiant' is only in VAL's own answer.
  '0:14:VAL': 'valor',
  // Thorne (Jhelom), TOWNE.TLK: REST's answer 'I like to exchange battle stories!' leads to EXCH/BATT/STOR, answered with a battle story; 'battleworn' is only the look line.
  '0:16:BATT': 'battle',
  // Thorne (Jhelom), TOWNE.TLK: TROL's answer '...ask ME for gold in order to pass!' leads to GALL/GOLD/PASS.
  '0:16:PASS': 'pass',
  // Judge Dryden (Yew), TOWNE.TLK: His job 'I am the head Inquisitor' leads to INQU; 'Inquisition' is in the answer.
  '0:19:INQU': 'inquisitor',
  // Tactus (Minoc), TOWNE.TLK: Both words are in the job line 'chainmail armour and coifs here at Darkwatch Armoury'; the answer ('finest in the land') serves either equally.
  '0:25:ARMO': 'armoury',
  // Fenelon (Minoc), TOWNE.TLK: CROW/NEST's answer 'They do have fine sails' leads to SEW/FINE/SAIL; 'finest' is only in FINE's own answer.
  '0:28:FINE': 'fine',
  // Fenelon (Minoc), TOWNE.TLK: NAST/SOUL's answer 'held in indentured servitude indefinitely' leads to IND/SERV.
  '0:28:IND': 'indentured',
  // Gruman (Trinsic), TOWNE.TLK: HONO leads to 'Dost thou seek the Mantra for the Virtue of Honor?'; the lead is 'blood of Honor's enemies'/'deeds of Honor', not 'honorable'.
  '0:34:HONO': 'honor',
  // Saul (Skara Brae), TOWNE.TLK: His job 'I am a visitor.' leads to VISI, answered 'Came to see an old friend!'.
  '0:40:VISI': 'visitor',
  // Yasuda (New Magincia), TOWNE.TLK: COMP's answer 'the black devils who come and take...' leads to SHAD/BLAC/DEVI.
  '0:43:BLAC': 'black',
  // Tetsuo (New Magincia), TOWNE.TLK: 'walking the path of virtue' (bye) and MISG's answer 'path of virtue freely' lead to VIRT/PATH; 'virtuous' is only in the answer.
  '0:44:VIRT': 'virtue',
  // Fumiko (New Magincia), TOWNE.TLK: COMM/FIEL's answer 'a choice we make freely!' leads to CHOI/FREE; 'freedom' is only in FREE's own answer.
  '0:45:FREE': 'free',
  // Jotham (Fogsbane), DWELLING.TLK: DANG's answer '...ocean floor in the Underworld' leads to UNDE/CAVE/WHIR; 'under' is only in UNDE's own answer.
  '1:2:UNDE': 'underworld',
  // Windmire (Stormcrow), DWELLING.TLK: WIFE's answer 'She helps me with the light.' leads to LIGH; 'lighthouse' (job line) names the same thing, so this is close.
  '1:3:LIGH': 'light',
  // Windmire (Stormcrow), DWELLING.TLK: PORT's answer 'Minoc has a well-known shipwright' leads to SHIP, answered with Captain Blythe's Crow's Nest.
  '1:3:SHIP': 'shipwright',
  // Windmire (Stormcrow), DWELLING.TLK: The lead is '...as well as a fine armourer!', answered with Shenstone the armourer; 'armoury' is only in the answer (armourer is in the armour/armourer group).
  '1:3:ARMO': 'armourer',
  // Emilly (Stormcrow), DWELLING.TLK: Her job 'I tend the light with my husband' leads to TEND/LIGH; 'lighthouse' comes only later.
  '1:4:LIGH': 'light',
  // Emilly (Stormcrow), DWELLING.TLK: ACCI's answer '...protecting these shipping lanes' leads to PROT/SHIP/LANE (sibling keywords); 'shipmate' belongs to MATE.
  '1:4:SHIP': 'shipping',
  // Anthony (Greyhaven), DWELLING.TLK: CHOR's answer 'I do my studies and clean my room.' leads to STUD.
  '1:5:STUD': 'studies',
  // Sir Arbuthnot (Greyhaven), DWELLING.TLK: The game answers the first COIN (with ROYA, from 'I am the Royal Coinmaker!'): 'That is to say I was...'; the file shows the second, unreachable COIN's answer.
  '1:15:COIN': 'coinmaker',
  // Alistair the Bard (Lord British'S Castle), CASTLE.TLK: His job 'I try to lift people's spirits through my music!' leads to SPIR/MUSI; 'musician' is only the look line.
  '2:1:MUSI': 'music',
  // Treanna (Lord British'S Castle), CASTLE.TLK: Same word: STAB's answer 'finest breeds in the land' leads to BREE; breed/breeds serve equally.
  '2:3:BREE': 'breed',
  // Hassad (Blackthorn'S Palace), CASTLE.TLK: FOUN/SHAD's answer 'I have knowledge Blackthorn seeks.' leads to KNOW/BLAC/SEEK.
  '2:17:KNOW': 'knowledge',
  // Vigil (North Britanny), CASTLE.TLK: THEM/FRIE's answer 'Thentis, Joshua, and Leof!' leads to THEN/JOSH/LEOF.
  '2:24:THEN': 'thentis',
  // Kurt (North Britanny), CASTLE.TLK: Same word: HORS's answer 'We have many breeds.' leads to BREE.
  '2:25:BREE': 'breed',
  // Squire Jimmy (East Britanny), CASTLE.TLK: HAWK's answer 'the third generation master shipwright!' leads to SHIP/MAST/APPR; 'Shipbuilding!' is TRAD's later answer.
  '2:27:SHIP': 'shipwright',
  // Flint (East Britanny), CASTLE.TLK: PART's answer 'newfangled magical stuff to run ships' leads to MAGI; 'magic' is only in NOW's later answer.
  '2:28:MAGI': 'magical',
  // Flint (East Britanny), CASTLE.TLK: The answer before ends 'things were just fine up 'til now.', leading to TIL/UNTI/NOW; 'Nowadays' is PART's earlier answer.
  '2:28:NOW': 'now',
  // Bandaii (Paws), CASTLE.TLK: The game answers the first MAGI (with BEAS, from 'I seek a magical beast'): the legendary horse; the file shows the second, unreachable MAGI's carpet answer.
  '2:30:MAGI': 'magical',
  // Sven (Buccaneer'S Den), CASTLE.TLK: PIRA's answer 'I was a glassblower' leads to GLAS (the first GLAS, answered 'Used to make fine and wonderful things').
  '2:37:GLAS': 'glassblower',
  // Sven (Buccaneer'S Den), CASTLE.TLK: The game answers the first CRYS (with SCUL/LIKE, from 'sculptures, crystals and the like'); the crystalline-swords CRYS in the file is a second, unreachable entry.
  '2:37:CRYS': 'crystal',
  // Lord Dalgrin (Buccaneer'S Den), CASTLE.TLK: WIND/SEA, answered 'I been 'round the world', come from 'where'er the winds take me' and 'to sail the seas'; 'seadogs' are Blackthorn's men, not this topic.
  '2:38:SEA': 'sea',
  // Temme (Farthing), KEEP.TLK: 'I've NEARLY made things disappear!' leads to THIN with its siblings NEAR/DISA (the townsman says 'things').
  '3:5:THIN': 'thing',
  // Rollo (The Lycaeum), KEEP.TLK: Both lead: LYCA's answer 'In our libraries...' and SCRI's 'duties of librarian'; equally served.
  '3:13:LIBR': 'libraries',
  // Rollo (The Lycaeum), KEEP.TLK: BRIT shares its answer with DOCU: both come from LYCA's 'important Britannian documents'.
  '3:13:BRIT': 'britannian',
  // Cory (Empath Abbey), KEEP.TLK: The game answers the first BRIT (with TURM/ENGU, from 'turmoil engulfing Britannia'); the file shows the second, unreachable BRIT's answer.
  '3:17:BRIT': 'britannia',
  // Tim (Empath Abbey), KEEP.TLK: 'his Court Composer Sir Kenneth is said to be traveling' leads to COUR/COMP/TRAV/KEN.
  '3:20:COMP': 'composer',
  // Toede (Serpent'S Hold), KEEP.TLK: His job 'I helped build Blackthorn's castle' leads to BUIL/CAST; 'Built' is only in LARG's later answer.
  '3:21:BUIL': 'build',
  // Sir Sean (The Lycaeum), KEEP.TLK: SHAD's answer 'They are foul spectres!' leads to FOUL/SPEC; 'foulest' comes only in a later question reply.
  '3:26:FOUL': 'foul',
  // Sir Sean (The Lycaeum), KEEP.TLK: SHAD's answer 'They are foul spectres!' leads to FOUL/SPEC; 'special' is an unrelated later word.
  '3:26:SPEC': 'spectres',
  // Toshi (Empath Abbey), KEEP.TLK: His job 'I am a student here at the Abbey.' leads to STUD.
  '3:28:STUD': 'student',
  // Maxwell (Serpent'S Hold), KEEP.TLK: SERP/HOLD's answer 'Here we study the Principle of Courage.' leads to PRIN/COUR/STUD, answered 'I study the many arts...'; 'student' (job) is close.
  '3:29:STUD': 'study',
  // Malifora (Moonglow), TOWNE.TLK: CROW/SCEP/AMUL are the three items Malifora sees; Lord British's Crown, not the Crow's Nest.
  '0:2:CROW': 'crown',
  // Malifora (Moonglow), TOWNE.TLK: SHAR answers 'I see them lying scattered deep in the underworld!': the Shards.
  '0:2:SHAR': 'shard',
  // Malik (Moonglow), TOWNE.TLK: FORT leads to Malik's own question 'Didst thou know my mother is a fortuneteller?'; Donn Piatt's 'ill fortune' is unrelated.
  '0:3:FORT': 'fortuneteller',
  // Malik (Moonglow), TOWNE.TLK: FREE is grouped with POWE/REAG/MAND/NIGH and answered 'He lives in Skara Brae, ask him.' - nothing to do with Fumiko's 'freedom'.
  '0:3:FREE': 'free',
  // Malik (Moonglow), TOWNE.TLK: GLAS/SWOR are answered about glass weapons; Eb points here with 'Ever heard of a glass sword?'.
  '0:3:SWOR': 'sword',
  // Lord Stuart the Hungry (Moonglow), TOWNE.TLK: MAGI/SPEL are answered about his spell to make food; 'magi' (Lady Janell's) is an odd label.
  '0:5:MAGI': 'magic',
  // Greyson (Britain), TOWNE.TLK: The question 'Who dost thou think is the rightful ruler of Britannia?' listens for Lord British.
  '0:6:BRIT': 'british',
  // Eb (Britain), TOWNE.TLK: Justin points here: 'Eb, our busboy, knows much of fine glassware!'; 'glass' would also serve.
  '0:8:GLAS': 'glassware',
  // Telila (Britain), TOWNE.TLK: rumors/rumours are one word spelled two ways; Quintin's lead is 'ask her for some rumours or gossip!'.
  '0:10:RUMO': 'rumors',
  // Bullwier (Jhelom), TOWNE.TLK: Telila's 'those famous Mystic Arms!' sends the player to Bullwier for MYST.
  '0:13:MYST': 'mystic',
  // Trian (Jhelom), TOWNE.TLK: Thorne asks 'Wilt thou be exploring the dungeon Destard?' and says 'Ask the minstrel!' (Trian).
  '0:14:DEST': 'destard',
  // Goeth (Jhelom), TOWNE.TLK: Zachariah: 'Goeth ... knows a newly discovered power of the moongates.'
  '0:15:MOON': 'moongate',
  // Goeth (Jhelom), TOWNE.TLK: Zachariah's 'power of the moongates' and the Word of Power lead to POWE; 'powerful' is never the topic.
  '0:15:POWE': 'power',
  // Thorne (Jhelom), TOWNE.TLK: The question 'Who dost thou serve?' listens for Lord British.
  '0:16:BRIT': 'british',
  // Chamfort (Yew), TOWNE.TLK: LAND is answered 'He is the local leader of the Resistance.' - Landon, named in Chamfort's own question.
  '0:17:LAND': 'landon',
  // Chamfort (Yew), TOWNE.TLK: 'Who told thee to ask me?' listens for Terrance.
  '0:17:TERR': 'terrance',
  // Landon (Yew), TOWNE.TLK: RESI leads into the Resistance's loyalty and password questions; Malifora's 'resides' is unrelated.
  '0:18:RESI': 'resistance',
  // Judge Dryden (Yew), TOWNE.TLK: 'Whom dost thou wish me to pity?' lists Yew's prisoners; Greymarch (Froed's father) is one, Greyson is a free bard.
  '0:19:GREY': 'greymarch',
  // Judge Dryden (Yew), TOWNE.TLK: 'Whom dost thou wish me to pity?' - Mario, in the stocks in Yew; Mariah is unrelated.
  '0:19:MARI': 'mario',
  // Jeremy (Yew), TOWNE.TLK: His question offers 'food, keys or perhaps information?' and KEY answers 'Have five!'.
  '0:20:KEY': 'key',
  // Fiona (Minoc), TOWNE.TLK: 'What makes thee think that I know?' listens for who sent thee - Rew of Minoc; 'rewop' is Goeth's backwards 'power'.
  '0:26:REW': 'rew',
  // Sindar (Trinsic), TOWNE.TLK: GREA/COUN/WIZA, answered 'Yes.', ask about the Great Council.
  '0:32:GREA': 'great',
  // Sindar (Trinsic), TOWNE.TLK: GREA/COUN ask about the Great Council, not 'counsel'.
  '0:32:COUN': 'council',
  // Sindar (Trinsic), TOWNE.TLK: WORD/POWE are answered 'INFAMA !' - a Word of Power.
  '0:32:POWE': 'power',
  // Jimmy (Trinsic), TOWNE.TLK: His question 'Many extraordinary powers had she!' leads to EXTR/POWE.
  '0:33:POWE': 'power',
  // Flain (Skara Brae), TOWNE.TLK: Judge Dryden: 'ask him of the Oppression!'; Flain's own question 'join the Oppression?'.
  '0:38:OPPR': 'oppression',
  // Flain (Skara Brae), TOWNE.TLK: 'Who sent thee?' listens for Judge Dryden (JUDG/DRYD).
  '0:38:JUDG': 'judge',
  // Flain (Skara Brae), TOWNE.TLK: A Great Council member to betray: Hassad; 'hass' is a stray fragment of Weblock's text.
  '0:38:HASS': 'hassad',
  // Flain (Skara Brae), TOWNE.TLK: A Great Council member: Malifora ('I served on the Great Council').
  '0:38:MALI': 'malifora',
  // Wartow (New Magincia), TOWNE.TLK: 'Who dost thou serve?' listens for Lord British.
  '0:48:BRIT': 'british',
  // Jotham (Fogsbane), DWELLING.TLK: His job 'I once sailed upon the open seas' leads to TRAV/SAIL/SEAS; 'travesty' is unrelated.
  '1:2:TRAV': 'travel',
  // Windmire (Stormcrow), DWELLING.TLK: Emilly tells of Windmire's 'best shipmate' who died; MATE/SCOT/ACCI are the matter he won't discuss.
  '1:3:MATE': 'mate',
  // Emilly (Stormcrow), DWELLING.TLK: ACCI's answer 'His best shipmate died in a storm' leads to MATE, answered 'His name was Scotty'.
  '1:4:MATE': 'mate',
  // David (Greyhaven), DWELLING.TLK: Charlotte: 'I live here with my husband and son, and maintain the lighthouse!' - the guess TEND/LIGH/MAIN.
  '1:7:LIGH': 'lighthouse',
  // David (Greyhaven), DWELLING.TLK: Charlotte's 'maintain the lighthouse' gives the guess MAIN; Weblock's 'main foyer' is unrelated.
  '1:7:MAIN': 'maintain',
  // David (Greyhaven), DWELLING.TLK: WIT/DIM is the 'dimwit' guess; 'wit' fits best of the candidates.
  '1:7:WIT': 'wit',
  // David (Greyhaven), DWELLING.TLK: SON/ANTH answer 'He's a brat of a kid!' - his son Anthony.
  '1:7:SON': 'son',
  // David (Greyhaven), DWELLING.TLK: WIFE/CHAR answer 'she's a good woman' - his wife Charlotte.
  '1:7:CHAR': 'charlotte',
  // Treanna (Lord British'S Castle), CASTLE.TLK: Kurt: 'Treanna would love to talk to thee about horses, especially Valorian horses!'; her breed question listens for VAL.
  '2:3:VAL': 'valorian',
  // Treanna (Lord British'S Castle), CASTLE.TLK: The talking horse's name, Smith (Bandaii).
  '2:3:SMIT': 'smith',
  // Treanna (Lord British'S Castle), CASTLE.TLK: A horse breed, 'those from the Steppes' (Kurt, Kraw).
  '2:3:STEP': 'steppes',
  // Treanna (Lord British'S Castle), CASTLE.TLK: Kraw's 'the plough and mountain breeds' and Kurt's 'Ploughhorses' both name the breed; equal.
  '2:3:PLOU': 'plough',
  // Treanna (Lord British'S Castle), CASTLE.TLK: A horse breed, 'the Mountain breed' (Kurt, Kraw).
  '2:3:MOUN': 'mountain',
  // Drudgeworth (Lord British'S Castle), CASTLE.TLK: WHO/KILL/HER follow 'I didn't mean to kill 'er!' - who did he kill; 'whole' is unrelated.
  '2:6:WHO': 'who',
  // Drudgeworth (Lord British'S Castle), CASTLE.TLK: 'I didn't mean to kill 'er!' leads to WHO/KILL/HER.
  '2:6:HER': 'her',
  // Weblock (Blackthorn'S Palace), CASTLE.TLK: Answered with the way to the throne room: Blackthorn himself.
  '2:14:BLAC': 'blackthorn',
  // Weblock (Blackthorn'S Palace), CASTLE.TLK: Answered 'The chef is probably in the kitchen.' - Gallrot the chef.
  '2:14:GALL': 'gallrot',
  // Weblock (Blackthorn'S Palace), CASTLE.TLK: Answered 'The jester is often hard to locate!' - Foulwell the jester.
  '2:14:FOUL': 'foulwell',
  // Hassad (Blackthorn'S Palace), CASTLE.TLK: POWE/WORD answered 'I don't know of what thou dost speak' - the Word of Power he guards.
  '2:17:POWE': 'power',
  // Thentis (North Britanny), CASTLE.TLK: Answered 'Never heard of it.' - the Resistance, which his own questions then ask about.
  '2:21:RESI': 'resistance',
  // Thentis (North Britanny), CASTLE.TLK: Answered 'A fine man...' 'Cough, cough!' - Blackthorn.
  '2:21:BLAC': 'blackthorn',
  // Thentis (North Britanny), CASTLE.TLK: His question 'Art thou helped, or hindered by the new laws?' listens for HELP.
  '2:21:HELP': 'helped',
  // Thentis (North Britanny), CASTLE.TLK: His own question says 'hindered'; Cory's 'hinders' is the same verb, so close.
  '2:21:HIND': 'hindered',
  // Leof (North Britanny), CASTLE.TLK: RESI leads to 'Hard to Resist...' and 'Whom dost thou resist?' - the Resistance.
  '2:23:RESI': 'resistance',
  // Leof (North Britanny), CASTLE.TLK: 'Whom dost thou resist?' listens for Blackthorn.
  '2:23:BLAC': 'blackthorn',
  // Vigil (North Britanny), CASTLE.TLK: Her question 'once I roamed the land as a warrior!' leads to ADVE/ROAM/LAND/WARR; Landon is unrelated.
  '2:24:LAND': 'land',
  // Sir Adam the Torch (East Britanny), CASTLE.TLK: Squire Jimmy: 'we try many new ideas!' ... 'Ask Sir Adam!' leads to IDEA.
  '2:26:IDEA': 'idea',
  // Glinkie (Paws), CASTLE.TLK: 'Where?' listens for MOON/GATE - the Moongate to the Shrine of Spirituality (her own next question).
  '2:29:MOON': 'moongate',
  // Glinkie (Paws), CASTLE.TLK: 'Where?' listens for MID - at midnight (her next question 'At midnight?').
  '2:29:MID': 'midnight',
  // Sven (Buccaneer'S Den), CASTLE.TLK: CAPT/AIR/SHIP follow '...the captain of a great airship', answered about airships.
  '2:37:SHIP': 'ship',
  // Lord Seggallion (Farthing), KEEP.TLK: 'What is it said that the eight planets represent?' listens for the virtues.
  '3:4:VIRT': 'virtue',
  // Elistaria (Windemere), KEEP.TLK: OPPR leads to the password and 'show thou art with Blackthorn and the Oppression!'.
  '3:9:OPPR': 'oppression',
  // Elistaria (Windemere), KEEP.TLK: Her question's '...items that may be useful in your mission' leads to MISS/ITEM.
  '3:9:MISS': 'mission',
  // Kristi (Serpent'S Hold), KEEP.TLK: LAND/EVIL answered 'There are many now that Lord British is gone.' - evil in the land; no lead in her talk, but Landon is unrelated.
  '3:24:LAND': 'land',
  // Read as well as heard (signs, Look, the shops, DATA.OVL's messages):
  // Malifora (Moonglow), TOWNE.TLK: her SHAD answer is the Shadowlords' magic; "shadow" is only read, in Look and messages.
  '0:2:SHAD': 'shadowlords',
  // Jimmy (Trinsic), TOWNE.TLK: EXTR's answer is his ship, "extraordinary"; "extra" is only a shopkeeper's line.
  '0:33:EXTR': 'extraordinary',
  // Saduj (Lord British's castle), CASTLE.TLK: his question listens for the Oppression's password, Impera (Flain's).
  '2:7:IMPE': 'impera',
  // Blackthorn (Blackthorn's palace), CASTLE.TLK: as Saduj's - the password, not the shopkeeper's "impervious".
  '2:10:IMPE': 'impera',
};
