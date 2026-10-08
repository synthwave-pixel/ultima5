The Ultima V Upgrade's music
============================

These sixteen XMI files are the music of "The Exodus Project: Ultima V
Upgrade", release 1.0 (21 August 2001), by Michael C. Maggio (Voyager
Dragon): MIDI arrangements of the songs of the Apple II and Commodore 128
versions of Ultima V: Warriors of Destiny, composed for Origin Systems.
The DOS game of 1988, which the engine plays, had no music; the Upgrade
patched it in.

  The Ultima 5 Upgrade:  https://exodus.voyd.net/projects/ultima5/
  The Exodus Project:    https://exodus.voyd.net/
  Its source:            https://bitbucket.org/mcmagi/ultima-exodus/

The engine plays them where the Upgrade does (web/src/game/music.ts), in
one of four soundtracks (web/src/audio/soundtracks.ts), each arrangement
rendered from these files to Opus files beside them (npm run music;
web/tools/music/), a folder to each:

  original/     the Upgrade's General MIDI arrangements, rendered through
                MuseScore General, a SoundFont shared under the MIT
                licence: FluidR3 (original version) by Frank Wen, Copyright
                (c) 2000-02; mono conversion (FluidR3Mono) by Michael
                Cowgill, Copyright (c) 2014-17; adaptation for
                MuseScore_General.sf2 by S. Christian Collins, Copyright
                (c) 2018-19; Temple Blocks by Ethan Winer, Copyright (c)
                2002; Drumline Cymbals by Michael Schorsch, Copyright (c)
                2016. Its licence and notices: MuseScore_General_License.md.
  remastered/   the same notes in the engine's own synthesized voices
                (web/src/audio/remaster.ts).
  celtic/ consort/ orchestra/ piano/ strings/
                the tunes arranged anew (web/tools/music/styles/) for
                General MIDI's instruments, rendered through MuseScore
                General as above: Classical's.
  grid/ newwave/ upsidedown/ juno/
                the tunes arranged anew for the engine's own synthesizers
                (web/tools/music/styles/engine.ts): Electronic's.

The XMI files are the renders' source and are kept here for that, and for the
tests that read them; the game never plays them, only the Opus files. Each is
named for what it holds (a hash of its bytes: BRITLAND.3fa9c01d.ogg), so a
tune rendered again is a new file to every player; the manifest
(web/src/audio/musicManifest.json) says which is which.

Ultima is a trademark of Electronic Arts. Neither the Upgrade nor this
engine is affiliated with or endorsed by Origin Systems or Electronic Arts.

  U5THEME.XMI   Ultima V Theme
  BRITLAND.XMI  Britannic Lands
  HORNPIPE.XMI  Cap'n Johne's Hornpipe
  ENGGMNT.XMI   Engagement and Melee
  STONES.XMI    Stones
  GREYSON.XMI   Greyson's Tale
  FANFARE.XMI   Fanfare for the Virtuous
  MONARCH.XMI   The Missing Monarch
  TRNTLLA.XMI   Villager Tarantella
  HALLS.XMI     Halls of Doom
  WRLDBLW.XMI   Worlds Below
  BLCKTHRN.XMI  Lord Blackthorn
  LADYNAN.XMI   Dream of Lady Nan
  REUNION.XMI   Joyous Reunion
  RULEBRIT.XMI  Rule Britannia
  AMIGA.XMI     Amiga Theme (the Amiga version's one song)
