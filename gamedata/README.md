# gamedata/

The developer's own copy of Ultima V, for the tests and the dev server.
The repository carries none of the game: nothing in this folder but this
README is committed (the root `.gitignore` sees to it).

- **`ultima5/`**: the MS-DOS game's files, loose - `DATA.OVL`,
  `BRIT.DAT`, `TOWNE.TLK`, `TILES.16` and the rest, as GOG or the
  Internet Archive have them. The rules' tests read them, and the dev
  server serves them to the installer's Scan for game files...
- **`ultima5/upgrade/`**: the Ultima V Upgrade's files, if you have it.
  The dev server offers its music (`*.XMI`) to the scan with the game;
  the tests that read the Upgrade look here.
- **`Ultima_V_-_Warriors_of_Destiny_1988.zip`**: the game zipped, as the
  Internet Archive has it (the files under `ultima5/`, the Upgrade's under
  `ultima5/upgrade/`). `web/tests/install.test.ts` reads it to test the
  installer on a zip.

So the folder looks like this:

    gamedata/
      README.md
      Ultima_V_-_Warriors_of_Destiny_1988.zip
      ultima5/
        DATA.OVL
        BRIT.DAT
        ...
        upgrade/
          U5THEME.XMI
          ...

Without `ultima5/`, `npm test` stops and says so; `npm run test:nodata`
runs the tests that need no game files. `npm run known` rebuilds the
installer's fingerprints of the known copies from what is here.
