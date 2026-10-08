# Key art brief: the box painting in place of the drawn Shadowlords

The game's promotional art (its Steam library artwork, the boot screen and
the README's banner) is drawn today by `web/tools/key-art.mjs`: the title
in the box's chrome lettering over three hooded Shadowlords drawn as
vectors, inside the box's red frame. This brief asks for a new version
that keeps the lettering and puts Denis Loubet's painting from the 1988
box in place of the drawn Shadowlords.

The art made to this brief is the game's key art now: `web/tools/key-art.mjs`
draws it, and `art/` at the repository's root has every picture at its
native size. A new version of it goes in `docs/key-art-candidates/<your
name>/`, for comparing.

## What changes, what stays

**Keep**

- **The title.** "Ultima V" in IM FELL English in the box's chrome (ice
  white at the top, a dark horizon, deep blue below), with its dark
  outline, soft shadow and light rim; "Warriors of Destiny" under it in
  the same face, pale blue, outlined. Both are drawn by `chromeText`
  and `plainText` in `web/tools/ankh.mjs` (the fonts are in
  `web/public/fonts/`). Use them as they are: the new art is about the
  picture, not the lettering.
- **New: the dateline.** Under "Warriors of Destiny", small:
  **1988 〜 2026**, the 1988 game made again. In the subtitle's face and pale blue, about
  six tenths its size, outlined as it is, with a generous space each side
  of the wave dash (about a type size and a quarter). IM FELL has no wave
  dash, so draw it as one smooth wave at the figures' mid-height. It goes
  with the title in the capsules, the boot screen and the banner.

**Replace**

- **The drawn Shadowlords** (and their mist) with the painting: the three
  hooded Shadowlords with their red eyes, the Avatar in his red surcoat
  with the white cross, and his fallen friend with the glowing blade.

**Remove**

- **Every red edge.** No red frame: neither the box's own (the stripes
  down the sides of the box scans) nor the drawn frame the current art
  puts round the capsules and the boot screen.
- **The box's lettering.** The painted title and subtitle, and "By Lord
  British". The painting must show none of the original text: the new
  title replaces it. (The painter's small signature, bottom right, may
  stay.)
- **The ankh** can go from all of them; the Avatar and his friend are now
  the picture's focus. (It was in the hero, the wide capsule, the capsule and the boot
  screen; it remains the app's icon.)

## Framing

**Keep the whole drama in every shape:** the three Shadowlords looming,
and the Avatar (the knight in the red surcoat) standing over his fallen
friend, who holds up the glowing blade. Never crop the friend away: from
the sky just above the tallest hood down to the moss at the friend's feet.
`web/art/cover/box-front-crop-800x520.png` shows how tightly the box's
front frames the Shadowlords and the knight, but it cuts off the friend -
go further down than it does. Where a shape is short (the wide capsule, the
hero), scale the whole scene down rather than crop it.

**Where a shape is wider or taller than the painting, carry the painting's
background on** - the dark wood, its trunks and moss - rather than
stretching or repeating the figures. Keep any red out of the extension:
the knight's surcoat smeared outward reads as a red edge. The best tool for that is generative
outpainting (Photoshop's Generative Expand or the like) on the background
only, with the figures left exactly as painted. Mirroring or tiling the
painting brings ghost copies of the knight and the Shadowlords into the
extension: don't. Where nothing better can be had, fade the painting into
its own colours, blurred and darkened, and then into the ground, as the
shipped version does.

## The shapes

| Picture | Size | Where it is shown | Notes |
|---|---|---|---|
| Portrait capsule | 600 × 900 | Steam's library grid | The whole painting at the top, its foot fading into the dark; the title, subtitle and dateline at the bottom. |
| Wide capsule | 920 × 430 | Steam's recent games, the store-like rows | The whole scene to the left, where it has the room; the title to the right, the painting fading under it. |
| Hero | 3840 × 1240 | Across the top of the game's page in Steam | **No title** (Steam's rule: no text in the hero); Steam lays the logo over it, at the bottom left, top centre, centre or bottom centre (the player's choice; bottom left unless moved). **Safe zone: only the middle 860 × 380 (x 1490–2350, y 430–810) is sure to stay visible** as the Steam window is resized; Steam's own example is that a main character's face should be inside it. Artwork should still run across the whole picture. Put the scene in the middle, as tall as the hero, with **the Avatar and his friend's face inside the safe zone** and the Shadowlords rising above it: the whole drama in the zone makes the scene too small for a window of the usual shape, where Steam shows the hero whole. The Steam Deck lays its status bar (search, battery, clock) across the top right: keep figures out of that corner. |
| Logo | 1280 × 720 | Over the hero | The title alone on transparency. Unchanged. |
| Boot screen | 1600 × 1000 (16:10) | While the game loads, in the browser and the apps | As the wide capsule: the scene to the left, the title to the right. (Today 320 × 200 at the game's grain; see Resolution.) |
| README banner | 1920 × 620 | The top of the README | As the wide capsule: the scene to the left, as tall as the banner; the title to the right. |

## Resolution

**Full resolution, smooth: the box art as the box was, a painting.** The
current art is drawn at the game's own coarse grain, each pixel grown to
a block, with scanlines; the new art is not. Deliver every shape at its
full size, smooth, with no scanlines or pixel grain.

## Sources

`web/art/cover/` (see its README). Use **`cover-hires-900x1301.png`**: the
finest scan (the chain mail, the belt's studs and the painter's signature
are crisp) and the most of the painting - more wood at both sides, the
fallen friend's legs, his sword and the red flowers at the foot. At every
size above the scene is shown no larger than it is in this scan, so no
upscaling is needed. Two things to know of it: its colours run warmer
than the box scans' (the surcoat orange where they have it red), and it
looks sharpened, perhaps enhanced; check the faces and eyes against the
other scans. The box's title is lettered over its top, the subtitle
reaching down to the tallest hood, and has to come out.

## Rights

The painting is Denis Loubet's, for Origin Systems (1988), and remains its
owners'. The README's Credits name it, and the art should not be altered
beyond the cropping, lettering removal and background extension above.

## Delivering

1. The pictures at the sizes above, smooth and at full size, in
   `docs/key-art-candidates/<your name>/`.
2. A line on how the background was extended.
3. Once a version is chosen, it replaces the drawing in
   `web/tools/key-art.mjs` (or its files are taken as they are), which
   writes them where they are used: `desktop/build/steam/`
   (`capsule.png`, `wide.png`, `hero.png`, `logo.png`),
   `web/public/boot.jpg` (a JPEG, for its size), `docs/banner.png`, and
   `art/` at their native sizes.
