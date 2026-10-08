# Overlays over the text windows

The text layer (`web/src/ui/text.ts`) can lay an overlay over part of a
window: something drawn on top of the window's cells for a while, with the
window carrying on underneath and nothing it did lost when the overlay is
taken away. The Standard look's full-height party panel uses it
(`web/src/game/layout.ts`); anything else that needs to draw over a text
window for a moment can use it the same way.

## Why

The game prints straight to the screen. A window has no model of its
content apart from what is drawn, so drawing over it destroys what was
there, and whatever the window prints while something lies over it would
draw on top of the overlay. The first version of the full-height panel
avoided this by moving the log's window down two rows and back, which
lost any line that scrolled out of the shortened log in the meantime (a
shopkeeper talking beside a list of arms) and relied on shifting the
log's cursor correctly. The overlay keeps the window where it is.

## The record

`Text` keeps a record of every screen cell it has drawn: the character,
its font, its colours, whether it was underlined, and whether it is a
border's cap. A cell cleared rather than drawn is marked as such
(`font` -1), so a space printed as a glyph is drawn again as a glyph.
Anything the text layer drew can therefore be drawn again exactly from
the record.

The borders' caps - the arrows either side of a label, and the log's
prompt - are part of the text layer for this reason. `printCap(side)`
records the cap (2 the left, 1 the right) and the screen's `TextTarget`
draws it: the glyph and the two white lines that join it to the border.
Before this the game drew those lines itself, outside the text layer, and
they could not have been drawn again.

## The API

```ts
text.cover(window, c1, r1, c2, r2); // lay an overlay over `window`'s cells (c1, r1)-(c2, r2) of the screen
// ... draw the overlay with other windows (or the framebuffer), and let the game go on ...
text.uncover(); // take it away: the covered cells drawn as the window now has them
```

While the cover is laid:

- What the covered window writes inside the rectangle - glyphs, caps,
  clears, the rows it scrolls - goes into a record of its own, the
  "under" record, and is not drawn.
- Folding reads the under record for those cells, so a repeat still folds
  into a covered line, and the count is there when it shows again.
- A scroll of the covered window that touches the rectangle cannot move
  the screen's pixels up a row (the overlay would move with them), so the
  window's uncovered cells are drawn again from the record instead.
- Every other window draws there as usual, into the screen's record.
- `uncover` puts the under record back into the screen's and draws the
  rectangle from it.

One cover at a time: a second `cover` before `uncover` throws.

`clearArea(c1, r1, c2, r2)` empties cells whatever window is current - for
a layout handing cells from one window to another (`layout.ts`
`relayout`).

## Using it

`layout.ts` is the pattern:

```ts
t.cover(Win.messages, 0x18, 9, 0x27, 10); // the log's top two rows
drawColumn(g); // the full-height panel's frame, by the framebuffer
drawVitals(g); // its text, by the stats window
// ... the screen that needs the panel runs; the log may print and scroll ...
drawColumn(g); // the panel's own height again
t.uncover(); // the log's two rows drawn as they now read
```

Wrap the whole of a command that needs an overlay, not the helpers inside
it (`withFullPanel(g, () => ...)`): the screens that use the full panel
draw their parts of it before they list anything.

Anything the overlay draws must go through another window or straight to
the framebuffer - never through the covered window, whose writes there
are kept under the cover by design.

## Testing

`web/tests/overlay.test.ts` holds the text layer to it with a fake screen
that keeps every cell's character, colour and cap: the same turns of play
are printed on a window that was covered part of the time and on one
never covered, and once uncovered the two screens must be identical, cell
for cell - scrolled lines, colours, caps and folded counts included.
`web/tests/layout.test.ts` does the same for the full-height panel in the
game. The fake platform's `log` (`web/tests/helpers.ts`) records what was
printed, in order, at `printChar`, so it reads the same whether or not an
overlay kept some of it unseen at the time.
