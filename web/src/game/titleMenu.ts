/**
 * titleMenu.ts
 *
 * The title's menu, as every game on this engine has it: Journey Onward (into the latest character's game, or a
 * choice of characters), Create New Character, the game's own lines, then the port's - Settings, Manage Saves, Steam
 * (beta) in the desktop app, a waiting update, Quit in the apps - with the boxes that come over it: a Steam launch's
 * note, a newer version's news and its offer. What the title shows and plays, and the game's own lines, are the
 * game's (TitleContent): Ultima V's are intro.ts's (its logo, flames, the introduction, the acknowledgements, the
 * view, the gypsy).
 */

import { GAME_NAME } from '../brand.ts';
import { Colour } from '../ui/colours.ts';
import { desktopModeWay } from '../ui/updates.ts';
import { chooseCharacter, MAX_CHARACTERS } from './characters.ts';
import { TICK_MS } from './effects.ts';
import type { GameCore } from './gameCore.ts';
import { asPad, upper } from './input.ts';
import { K, Pad } from './io.ts';
import { menuSound, titleRoom } from './menu.ts';
import { loadOptions } from './settings.ts';
import { characters, currentCharacter, localSave, roomForCharacter } from './storage.ts';
import { saveCodec } from './saveCodec.ts';

/** The title's line in Journey Onward's place where the game is played from Steam (TitleMenu steamOnly). */
const FROM_STEAM = 'Launch From Steam';
/** The title menu's box: the lines it holds (more scroll). */
const MENU_ROWS = 8;

/** What a game shows and does at its title, around the menu (Ultima V's: intro.ts Intro.titleContent). */
export interface TitleContent {
  /** The game's own lines' keys, Journey Onward and Create New Character first ("JCUAR"). */
  readonly gameKeys: string;
  /** The key the title takes on its own when left idle (Ultima V: R, the view). */
  readonly idleKey: string;
  /** The row, in pixels, from which the menu's box is drawn in the Standard look's copper. */
  readonly menuRow: number;
  /**
   * The row, in pixels, of the menu's box's top border, where it is not the text row under menuRow (Ultima V's: its
   * copper begins a row above the border). A dialog at the title keeps a row clear above it (menu.ts framedBox).
   */
  readonly boxTop?: number;
  /** A game line's column and its text; undefined for the port's lines. */
  gameLine(key: string): [number, string] | undefined;
  /** The opening, once as the title first comes up; whether it ran its course (the idle scenes then follow). */
  opening(): Promise<boolean>;
  /** The scenes the title shows when left idle. */
  attract(): Promise<void>;
  /** The title's picture and the menu's box, drawn again (after something came over them). */
  drawTitle(): Promise<void>;
  /** The line in the title's bottom border. */
  banner(): void;
  /** The prompt in the menu's top border, and its cursor. */
  prompt(): void;
  /** The cursor turned `n`, a turn a tick while the menu waits. */
  spin(n: number): void;
  /** A tick of the title's own animation while the menu waits. */
  idle(): void;
  /** The title's music, and silence. */
  playTheme(): void;
  quiet(): void;
  /** A new character made (or not), and the title drawn again. */
  newCharacter(): Promise<void>;
  /** One of the game's own other lines, chosen (Ultima V: U, A, R). */
  line(key: string): Promise<void>;
}

export class TitleMenu {
  constructor(
    private readonly g: GameCore,
    private readonly content: TitleContent,
  ) {
    // The dialogs over the title kept above its box, a row clear of its border (Ultima V: 14 rows).
    titleRoom(((content.boxTop ?? content.menuRow + 8) >> 3) - 1);
  }

  /** The choices, one highlighted (Ultima V: INTRO_06bc). */
  menu(sel: number): void {
    // The Standard look's copper for the menu's box, below the logo.
    this.g.draw.chrome?.(true, this.content.menuRow);
    const g = this.g;
    // The game's five, and the port's own lines under them: its settings, managing the saves (characterMenu.ts),
    // Steam (beta) in the desktop app (steamMenu.ts), a newer version (ui/updates.ts), and Quit in the apps. Played
    // from Steam, Launch From Steam stands in the place of the lines that start a game, and of Settings.
    const version = this.g.hooks.update?.offer()?.version;
    const keys = this.menuKeys();
    const items = [...keys].map((k): [number, string] => {
      const line = this.content.gameLine(k);
      if (line) return line;
      const label =
        k === 'L'
          ? FROM_STEAM
          : k === 'S'
            ? 'Settings'
            : k === 'M'
              ? 'Manage Saves'
              : k === 'T'
                ? 'Steam (beta)'
                : k === 'Q'
                  ? 'Quit'
                  : version
                    ? `Update (${version})`
                    : 'Update';
      return [(0x28 - label.length - 2) >> 1, label];
    });
    // The box holds eight lines: more, and they scroll with the bar, an arrow at the box's edge where there are more
    // above or below.
    const top = items.length > 6 ? 0x10 : 0x11;
    const scrolls = items.length > MENU_ROWS;
    if (scrolls) {
      if (sel < this.menuTop) this.menuTop = sel;
      if (sel >= this.menuTop + MENU_ROWS) this.menuTop = sel - MENU_ROWS + 1;
      this.menuTop = Math.max(0, Math.min(this.menuTop, items.length - MENU_ROWS));
      g.text.clearArea(1, top, 0x26, top + MENU_ROWS - 1);
    } else this.menuTop = 0;
    const shown = scrolls ? items.slice(this.menuTop, this.menuTop + MENU_ROWS) : items;
    if (scrolls) {
      const fg = g.text.win.fg;
      g.text.win.fg = Colour.lightGray;
      if (this.menuTop > 0) {
        g.text.moveTo(0x25, top);
        g.printChar(0x18);
      }
      if (this.menuTop + MENU_ROWS < items.length) {
        g.text.moveTo(0x25, top + MENU_ROWS - 1);
        g.printChar(0x19);
      }
      g.text.win.fg = fg;
    }
    shown.forEach(([x, text], row) => {
      const i = row + this.menuTop;
      if (i === sel) g.printChar(0xfd);
      g.text.moveTo(x, row + top);
      // Journey Onward grey with no game saved to journey on with, and Launch From Steam (the port's), passed over by
      // the bar.
      const fg = g.text.win.fg;
      if (this.greyAt(keys, i)) g.text.win.fg = 8;
      g.printChar(' ');
      g.print(text);
      g.printChar(' ');
      g.text.win.fg = fg;
      if (i === sel) g.printChar(0xfd);
    });
  }

  /**
   * Character `id` the one in play, their settings in use (the look, the tiles, the sound and the music changed to
   * theirs); null, the latest's (storage.ts currentCharacter).
   */
  private useCharacter(id: string | null): void {
    const g = this.g;
    chooseCharacter(id);
    if (id === null) currentCharacter();
    g.options = loadOptions();
    g.hooks.applyOptions?.(g.options);
  }

  /** No game is saved: Journey Onward is grey, and the bar starts on Create New Character (menu, run). */
  private noSave = false;

  /**
   * The title's lines' keys: the game's five, then the port's - Settings, Manage Saves (always: Import is how a new
   * machine's first game may come), Steam (beta) in the desktop app, a waiting update, Quit in the apps. More than the
   * box's eight scroll.
   */
  private menuKeys(): string {
    const after = (this.g.hooks.update?.offer() ? '!' : '') + (this.g.hooks.quit ? 'Q' : '');
    const steam = this.g.hooks.steam ? 'T' : '';
    const game = this.content.gameKeys;
    if (this.steamOnly()) return 'L' + game.slice(2) + 'M' + steam + after;
    return game + 'SM' + steam + after;
  }

  /**
   * Whether the game is played from Steam (the port's): Play from Steam on, and this copy not started by Steam. Then
   * Journey Onward, Create New Character and Settings give way to Launch From Steam, grey, so that a game is started
   * only where Steam keeps it; Steam (beta) is still there to turn Play from Steam off.
   */
  private steamOnly(): boolean {
    const steam = this.g.hooks.steam;
    if (!steam || steam.launched()) return false;
    const o = steam.options();
    return o.playLine || o.compatTool || o.macPlay;
  }

  /** Whether the title's line `i` of `keys` is grey, passed over by the bar: Launch From Steam, or Journey Onward with no game. */
  private greyAt(keys: string, i: number): boolean {
    return keys[i] === 'L' || (keys[i] === 'J' && this.noSave);
  }

  /** Whether Cloud saves on by default has been looked at this launch (newsBox). */
  private cloudAsked = false;

  /** Whether a newer version waits to be told of (updateBox). */
  private updateDue(): boolean {
    const offer = this.g.hooks.update?.offer();
    return (!!offer && !offer.told) || !!this.g.hooks.update?.news?.() || !!this.g.hooks.note?.();
  }

  /**
   * A note (hooks.note: a Steam launch's), or the first start of a newer version (the desktop app's), said once in a
   * box of its own over the title: for a version, updated from what, and What's new - the release's notes, fetched from GitHub, as the game's own text pages. Whether the
   * box was shown (the title to be drawn again).
   */
  private async newsBox(): Promise<boolean> {
    const g = this.g;
    // Cloud saves on by default, first: where the saves are kept, before anything is said of them.
    if (!this.cloudAsked && g.hooks.steam?.launched()) {
      this.cloudAsked = true;
      const { cloudByDefault } = await import('./cloudSwitch.ts');
      if (await cloudByDefault(g)) {
        this.noSave = localSave.read() === null;
        return true;
      }
    }
    const update = g.hooks.update;
    const note = g.hooks.note?.();
    if (note) {
      note.seen();
      g.p.flushKeys();
      const { choose, showText, wrap } = await import('./menu.ts');
      const lines = [...wrap(note.text).map((label) => ({ label, enabled: false })), { label: '', enabled: false }];
      // A choice beside OK (macOS Sync's Fix now), on the bar first; what came of it said after.
      const items = [...lines, ...(note.action ? [{ label: note.action.label }] : []), { label: 'OK' }];
      const i = await choose(g, 'Steam', items, lines.length, true);
      if (note.action && i === lines.length) {
        const said = await note.action.run().catch((e: unknown) => `That didn't work: ${e instanceof Error ? e.message : String(e)}`);
        await showText(g, 'Steam', wrap(said ?? "That can't be changed here."));
      }
      return true;
    }
    const news = update?.news?.();
    if (!update || !news) return false;
    update.newsSeen?.();
    g.p.flushKeys();
    const { choose, showText, wrap } = await import('./menu.ts');
    const lines = [
      ...wrap(`Updated to ${GAME_NAME} ${news.version}, from ${news.from}. Your saved game carries over.`).map((label) => ({
        label,
        enabled: false,
      })),
      { label: '', enabled: false },
    ];
    const i = await choose(g, 'Updated', [...lines, { label: "What's new" }, { label: 'OK' }], lines.length, true);
    if (i !== lines.length) return true;
    const notes = await update.notes?.(news.version);
    const text = notes
      ? notes.split('\n').flatMap((l) => (l.trim() === '' ? [''] : wrap(l)))
      : wrap("The release's notes could not be fetched here. They are on the game's Releases page.");
    await showText(g, `What's new in ${news.version}`, text);
    return true;
  }

  /** The first of the title menu's lines shown, where there are more than its box holds (menu). */
  private menuTop = 0;

  /**
   * A newer version not yet told of (ui/updates.ts), in a box of its own over the title, once a version: what it is,
   * and the way to it - the restart into a build come down, or its release's page, to read what changed and download
   * from; or, where no page can be offered, only the way to it said. Later leaves it in the menu's Update line, which
   * shows it `again` where there is nothing to take up. Whether the box was shown (the title to be drawn again).
   */
  private async updateBox(again = false): Promise<boolean> {
    const g = this.g;
    const update = g.hooks.update;
    const offer = update?.offer();
    if (!update || !offer || (offer.told && !again)) return false;
    if (!offer.told) update.told();
    // Keys pressed before it came (the opening skipped, the menu moved) are let go: none may answer it unseen.
    g.p.flushKeys();
    const { choose, wrap } = await import('./menu.ts');
    const restart = offer.kind === 'restart';
    const name = offer.version ? `${GAME_NAME} ${offer.version}` : 'A new version';
    const out = `${name} is out${offer.current ? `; this is ${offer.current}` : ''}.`;
    const text = !restart
      ? offer.page === false
        ? `${out} ${desktopModeWay(offer)}`
        : `${out} Its page says what is new. Your saved game carries over.`
      : offer.onQuit
        ? `${name} has downloaded. It installs when the game quits.`
        : !offer.installed
          ? `${name} has downloaded. It is installed when you quit, or restart to play it now.`
          : offer.quits
            ? `${name} is installed. Quit, and start the game again to play it.`
            : `${name} is installed. Restart to play it now, or it starts the next time you play.`;
    const lines = [...wrap(text).map((label) => ({ label, enabled: false })), { label: '', enabled: false }];
    // Where there is nothing to take up, the box is only closed.
    const go = restart
      ? offer.onQuit
        ? null
        : offer.quits
          ? 'Quit now'
          : 'Restart now'
      : offer.page === false
        ? null
        : 'Open release page';
    const i = await choose(
      g,
      restart ? 'Update ready' : 'Update available',
      [...lines, ...(go ? [{ label: go }, { label: 'Later' }] : [{ label: 'OK' }])],
      lines.length,
      true,
    );
    if (go && i === lines.length) update.apply();
    return true;
  }

  /** The title's windows, and its banner and menu in them (the first item chosen). */
  draw(sel = 0): void {
    const g = this.g;
    const t = g.text;
    t.setWindow(0, 1, 0x10, 0x26, 0x17);
    t.select(0);
    g.printChar(0xff);
    t.setWindow(0, 0, 0, 0x27, 0x18);
    t.setWindow(1, 0x18, 1, 0x27, 9);
    t.setWindow(2, 0x18, 0xb, 0x27, 0x17);
    this.content.banner();
    this.menu(sel);
  }

  /** The title's menu, round and round (Ultima V: INTRO_0986_Main): returns when the player journeys onward with a game in hand. */
  async run(): Promise<void> {
    const g = this.g;
    g.draw.chrome?.(false);
    const t = g.text;
    t.select(0);
    t.setWindow(0, 0, 0, 0x27, 0x18);
    if (await this.content.opening()) {
      this.content.playTheme();
      await this.content.attract();
    }
    /** A choice made for the player, taken on the menu's next round (Journey Onward with no game: Create a character). */
    let queued = 0;
    for (;;) {
      this.content.playTheme();
      this.noSave = localSave.read() === null;
      let keys = this.menuKeys();
      let choice = 0;
      while (this.greyAt(keys, choice)) choice++;
      this.draw(choice);
      let key = queued;
      queued = 0;
      while (key <= 0x20) {
        // An update may come down while the title waits: its box, once a version, and its line added then.
        if ((await this.newsBox()) || (await this.updateBox())) {
          await this.content.drawTitle();
          this.draw(choice);
        }
        if (this.menuKeys() !== keys) {
          keys = this.menuKeys();
          this.menu(choice);
        }
        this.content.prompt();
        key = 0;
        for (let n = 0; n < 200 && key === 0 && !this.updateDue(); n++) {
          key = upper(asPad(g, g.p.pollKey())); // a keyboard read as a controller is one here too
          if (key === 0) {
            this.content.spin(n);
            this.content.idle();
            await this.g.p.sleep(TICK_MS);
          }
        }
        // An update come while the title waits: its box at once (the loop's head), not after the next key.
        if (key === 0 && this.updateDue()) continue;
        switch (key) {
          case K.Left:
          case K.Up:
            do choice = choice === 0 ? keys.length - 1 : choice - 1;
            while (this.greyAt(keys, choice));
            this.menu(choice);
            menuSound(g, 'move');
            break;
          case K.Right:
          case K.Down:
            do choice = choice === keys.length - 1 ? 0 : choice + 1;
            while (this.greyAt(keys, choice));
            this.menu(choice);
            menuSound(g, 'move');
            break;
          case K.Enter:
          case K.Space:
          case Pad.A:
            key = keys.charCodeAt(choice);
            break;
          case 0:
            key = this.content.idleKey.charCodeAt(0);
            break;
          default: {
            // (Launch From Steam is no choice: its letter is no key.)
            const i = keys.indexOf(String.fromCharCode(key));
            if (i >= 0 && keys[i] !== 'L') this.menu(i);
            else key = 0;
          }
        }
      }
      switch (key) {
        case 0x4a: {
          this.content.quiet();
          const kept = characters();
          if (kept.length === 0) {
            // In a box of its own over the title's picture, as the new character's question is (where 1988 printed
            // "No active game. Please create a character" in the message window's place, over the menu's lines), the
            // way on offered as the menu's first line.
            const { choose } = await import('./menu.ts');
            const i = await choose(
              g,
              'Journey Onward',
              [
                { label: 'No game is saved yet.', enabled: false },
                { label: '', enabled: false },
                { label: 'Create a character' },
                { label: 'Back' },
              ],
              2,
              true,
            );
            await this.content.drawTitle();
            if (i === 2) queued = 0x43;
            break;
          }
          // One character: theirs, straight in. More: whose (characterMenu.ts), any deleted there.
          // (The menu's lines drawn again under its boxes: titleMenu.)
          let who = kept[0];
          if (kept.length > 1) {
            const { pickCharacter } = await import('./characterMenu.ts');
            const picked = await pickCharacter(g, async () => {
              await this.content.drawTitle();
              this.draw(0); // the bar where it was, on Journey Onward
            });
            if (!picked) {
              // Back, or a deletion that left one or none: the title, in the latest's settings.
              this.useCharacter(null);
              await this.content.drawTitle();
              break;
            }
            who = picked;
          }
          this.useCharacter(who.id);
          saveCodec().restore(g, who.data, true);
          return;
        }
        case 0x43: {
          // No more than MAX_CHARACTERS (characters.ts): at that, a character must go before another is made.
          if (!roomForCharacter()) {
            const { choose, wrap } = await import('./menu.ts');
            // Wrapped to the box, as a question is (menu.ts confirm).
            const said = wrap(`${MAX_CHARACTERS} characters are kept, all there is room for. Delete one to make another.`);
            const i = await choose(
              g,
              'Create New Character',
              [
                ...said.map((label) => ({ label, enabled: false })),
                { label: '', enabled: false },
                { label: 'Delete a character...' },
                { label: 'Back' },
              ],
              said.length + 1,
              true,
            );
            if (i === said.length + 1) {
              const { deleteCharacterMenu } = await import('./characterMenu.ts');
              const redraw = async (): Promise<void> => {
                await this.content.drawTitle();
                this.draw(1);
              };
              await redraw();
              if (await deleteCharacterMenu(g, redraw)) this.useCharacter(null);
            }
            await this.content.drawTitle();
            break;
          }
          await this.content.newCharacter();
          break;
        }
        case 0x4d: {
          // Manage Saves: Export and Import saved game, Delete Character, Remove game files (characterMenu.ts).
          const { manageSavesMenu } = await import('./characterMenu.ts');
          const redraw = async (): Promise<void> => {
            await this.content.drawTitle();
            this.draw(keys.indexOf('M'));
          };
          if ((await manageSavesMenu(g, redraw)) === 'deleted') this.useCharacter(null);
          await this.content.drawTitle();
          break;
        }
        case 0x53: {
          const { settingsMenu } = await import('./menu.ts');
          // On a cleared screen, as in the game (the panel draws its own frame, the map's, centred); the title is
          // drawn again after.
          g.draw.pen = 0;
          g.draw.fill(0, 0, 319, 199);
          await settingsMenu(g, true);
          t.select(0);
          g.printChar(0xff);
          await this.content.drawTitle();
          break;
        }
        case 0x54: {
          // Steam (beta), the desktop app's (steamMenu.ts): on a cleared screen, as Settings is; the title drawn again after.
          const { steamMenu } = await import('./steamMenu.ts');
          g.draw.pen = 0;
          g.draw.fill(0, 0, 319, 199);
          await steamMenu(g);
          t.select(0);
          g.printChar(0xff);
          await this.content.drawTitle();
          break;
        }
        case 0x21:
          // Nothing to take up (a release with no page to offer): its box again, saying the way to it.
          if (g.hooks.update?.offer()?.page === false) {
            await this.updateBox(true);
            await this.content.drawTitle();
          } else g.hooks.update?.apply();
          break;
        case 0x51:
          g.hooks.quit?.(); // the app goes; should it not, the title is still here
          break;
        default:
          // The game's own other lines (Ultima V: the introduction, the acknowledgements, the view).
          await this.content.line(String.fromCharCode(key));
      }
    }
  }
}
