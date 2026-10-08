# Key art

The game's key art at its native sizes: each picture as large as the scan
of the box's painting allows, the painting shown at no more than its own
size, and never smaller than the size the picture is used at. Drawn by
`web/tools/key-art.mjs` (`node tools/key-art.mjs` in `web/`), which also
writes the copies the game uses; `docs/key-art-brief.md` says what the art
is.

| File | Size | What it is | Used at, and where |
|---|---|---|---|
| `capsule.png` | 900 × 1350 | The portrait capsule: the painting, the title below | 600 × 900, Steam's library grid (`desktop/build/steam/`) |
| `wide.png` | 2201 × 1029 | The wide capsule: the scene left, the title right | 920 × 430, Steam's recent games (`desktop/build/steam/`) |
| `hero.png` | 3840 × 1240 | The hero: the scene in the middle, no words | 3840 × 1240, across the top of the game's page in Steam (`desktop/build/steam/`) |
| `logo.png` | 2560 × 1440 | The title and subtitle on nothing (drawn, so at twice its size) | 1280 × 720, laid over the hero (`desktop/build/steam/`) |
| `boot.png` | 1649 × 1031 | The boot screen: the scene left, the title right | 1600 × 1000, while the game loads (`web/public/boot.jpg`) |
| `banner.png` | 3840 × 1240 | The README's banner: as the boot screen, wider | 1920 × 620, the top of the README (`docs/banner.png`) |

The hero, at Steam's 3840 × 1240, shows the painting a little larger than
the scan, and is that size here too. The painting is Denis Loubet's, for
Origin Systems (1988), from the scan in `web/art/cover/`; it remains its
owners'.
