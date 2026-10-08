/**
 * installer.ts
 *
 * The first-run page: the player gives the engine their copy of MS-DOS
 * Ultima V by scanning for it (Scan for game files...: the disk in the
 * desktop app, the site's gamedata/ on the web; sources.ts), dropping its
 * folder, its files or a .zip on the page, or picking them. What is found is checked (gameFiles.ts), stored
 * (store.ts), and handed back. A file unlike every known copy - edited by a
 * modder, or damaged - is named, and installed only if the player says so. Plain HTML over the black page; the game's
 * own screen takes over once the files are in. Its buttons are a menu to a controller and the keys as the game's are
 * (pageMenu.ts): a Steam Deck in Game Mode or an Android handheld has no mouse to get past it with.
 */

import { GameFiles } from '../data/files.ts';
import { complete, identify, listed, type Candidate, type Identified } from './gameFiles.ts';
import { scanOutcome } from './scan.ts';
import { androidFolder, autoscanAsked, desktopScan, webCopy } from './sources.ts';
import { saveInstalled } from './store.ts';
import { readZip } from './zip.ts';
import { driveMenu, usable } from '../ui/pageMenu.ts';

const STYLE = `
.u5-install { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: #000; color: #aaa; font: 16px/1.5 ui-monospace, Menlo, Consolas, monospace; padding: 16px; box-sizing: border-box; z-index: 10; }
.u5-install .box { max-width: 640px; width: 100%; border: 2px solid #55f; padding: 24px; box-sizing: border-box; }
.u5-install h1 { color: #fff; font-size: 22px; margin: 0 0 12px; letter-spacing: 1px; }
.u5-install p { margin: 0 0 12px; }
.u5-install a { color: #5ff; }
.u5-install .drop { border: 2px dashed #555; padding: 20px; text-align: center; margin: 16px 0; color: #fff; }
.u5-install .drop.over { border-color: #ff5; background: #111; }
.u5-install button { font: inherit; background: #0000aa; color: #fff; border: 2px solid #55f; padding: 8px 14px; margin: 4px 8px 4px 0; cursor: pointer; }
.u5-install button:focus { outline: none; }
.u5-install button.at { outline: 2px solid #ff5; outline-offset: 2px; }
.u5-install .status { min-height: 3em; color: #ff5; white-space: pre-wrap; }
.u5-install .warn { display: none; margin-top: 4px; }
.u5-install .warn.on { display: block; }
`;

/** Files from a drop: folders are walked (webkitGetAsEntry), archives opened. */
async function fromDataTransfer(dt: DataTransfer): Promise<Candidate[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return fromFiles([...dt.files]);
  const files: { path: string; file: File }[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      files.push({ path: prefix + entry.name, file });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (batch.length === 0) break;
        for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return expand(files);
}

async function fromFiles(list: File[]): Promise<Candidate[]> {
  return expand(list.map((file) => ({ path: file.webkitRelativePath || file.name, file })));
}

/** Read each file; open zips and take their contents instead. */
async function expand(files: { path: string; file: File }[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const { path, file } of files) {
    const data = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(path)) {
      for (const e of await readZip(data)) out.push({ path: `${path}/${e.path}`, data: e.data });
    } else {
      out.push({ path, data });
    }
  }
  return out;
}

/** What is to be said of files that are not as any known copy has them; none if all are. */
export function warnings(found: Identified): string[] {
  const lines: string[] = [];
  if (found.damaged.length) lines.push(`Damaged in the .zip (its own check fails): ${listed(found.damaged)}.`);
  if (found.changed.length) lines.push(`Not as in any known copy - edited, or damaged: ${listed(found.changed)}.`);
  if (lines.length) lines.push('The game may not play as it should. A modded copy is fine to install.');
  return lines;
}

/**
 * Show the installer until a complete copy is given; resolves with the files, already stored. `notice`, if given, is
 * said first: why the copy installed before will not do.
 */
export function runInstaller(notice?: string): Promise<GameFiles> {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'installer';
  root.className = 'u5-install';
  root.innerHTML = `
    <div class="box" role="dialog" aria-labelledby="u5-title">
      <h1 id="u5-title">ULTIMA V: WARRIORS OF DESTINY</h1>
      <p>This is a new engine for Ultima V. It plays your own copy of the MS-DOS game, which it does not include.</p>
      <p data-intro>Scan for it where it is usually kept, or give it the game's folder, its files, or a .zip of them: from a GOG
         installation, or the Internet Archive's copy. Everything is kept in this game's own storage.</p>
      <button type="button" data-scan>Scan for game files…</button>
      <div class="drop" tabindex="-1">Drop the Ultima V folder, files or .zip here</div>
      <button type="button" data-pick="folder">Choose folder…</button>
      <button type="button" data-pick="files">Choose files or .zip…</button>
      <p class="status" aria-live="polite"></p>
      <div class="warn">
        <button type="button" data-warn="install">Install anyway</button>
        <button type="button" data-warn="again">Choose again</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const drop = root.querySelector('.drop') as HTMLElement;
  const status = root.querySelector('.status') as HTMLElement;
  const warn = root.querySelector('.warn') as HTMLElement;
  if (notice) status.textContent = notice;
  /** The copy found, waiting on the player's word where it is unlike the known ones. */
  let waiting: Identified | null = null;

  // The buttons as a menu: the highlight on Scan for game files... where it is offered (the likeliest way in), else on
  // the first shown; B backs out of Install anyway's question, as Choose again does.
  const buttons = (): HTMLButtonElement[] => [...root.querySelectorAll('button')].filter(usable);
  const firstButton = (): HTMLButtonElement | null => buttons()[0] ?? null;
  const chooseAgain = (): void => {
    waiting = null;
    warn.classList.remove('on');
    status.textContent = '';
    firstButton()?.focus();
  };
  let stopMenu = (): void => undefined;

  return new Promise((resolve) => {
    const install = async (found: Identified): Promise<void> => {
      status.textContent = 'Installing…';
      await saveInstalled(found.files);
      stopMenu();
      root.remove();
      style.remove();
      resolve(found.files);
    };
    const tryInstall = async (get: () => Promise<Candidate[]>): Promise<void> => {
      status.textContent = 'Reading…';
      waiting = null;
      warn.classList.remove('on');
      try {
        const found = identify(await get());
        if (!complete(found)) {
          const lines: string[] = [];
          if (found.wrong.length) lines.push(`Not the MS-DOS v1.16 version: ${found.wrong.join(', ')}`);
          if (found.missing.length)
            lines.push(
              `Missing ${found.missing.length} file(s): ${found.missing.slice(0, 8).join(', ')}${found.missing.length > 8 ? ', …' : ''}`,
            );
          status.textContent = lines.join('\n');
          return;
        }
        const said = warnings(found);
        if (said.length) {
          waiting = found;
          status.textContent = said.join('\n');
          warn.classList.add('on');
          (warn.querySelector('[data-warn="install"]') as HTMLElement).focus();
          return;
        }
        await install(found);
      } catch (e) {
        status.textContent = `Could not read that: ${e instanceof Error ? e.message : String(e)}`;
      }
    };

    // Scan for game files... (sources.ts): the disk in the desktop app, the site's gamedata/ on the web. A verified copy
    // is installed and the game goes on; anything else is said.
    const desktop = desktopScan();
    const nothing = desktop
      ? 'No game files found beside the app, at home, or where GOG and the game launchers install games.'
      : 'This site serves no game files.';
    const scan = async (): Promise<void> => {
      status.textContent = desktop ? 'Looking for Ultima V…' : 'Looking for game files on this site…';
      waiting = null;
      warn.classList.remove('on');
      try {
        const copies = desktop ? await desktop() : await webCopy(fetch, import.meta.env.BASE_URL);
        const got = scanOutcome(copies, nothing);
        if (got.kind === 'report') {
          status.textContent = got.text;
          return;
        }
        status.textContent = `Found Ultima V in ${got.where}. Installing…`;
        await install(got.found);
      } catch (e) {
        status.textContent = `Could not scan: ${e instanceof Error ? e.message : String(e)}`;
      }
    };
    root.querySelector('[data-scan]')!.addEventListener('click', () => void scan());
    // Android does not scan: its player picks the folder (below), and ?autoscan=true does nothing there.
    const android = androidFolder();
    if (android) {
      (root.querySelector('[data-scan]') as HTMLElement).hidden = true;
      (root.querySelector('[data-intro]') as HTMLElement).textContent =
        "Choose the game's folder, or give it its files or a .zip of them: from a GOG installation, or the Internet Archive's copy. Everything is kept in this game's own storage.";
    }
    stopMenu = driveMenu(root, {
      buttons,
      first: firstButton,
      back: () => {
        if (warn.classList.contains('on')) chooseAgain();
      },
    });
    if (autoscanAsked(location.search) && !android) void scan();

    const pick = (folder: boolean): void => {
      // Android's web view cannot choose a folder: its own picker, through the app (sources.ts androidFolder). The
      // player chose this folder, so the whole flow runs, a modified copy getting Install anyway.
      if (folder && android) {
        // A cancelled pick says nothing; a folder without the game's files gets tryInstall's report of what is missing.
        void (async () => {
          let got: Awaited<ReturnType<typeof android>>;
          try {
            got = await android();
          } catch (e) {
            status.textContent = `Could not read that: ${e instanceof Error ? e.message : String(e)}`;
            return;
          }
          if (!got) {
            status.textContent = '';
            return;
          }
          await tryInstall(async () => got.files);
        })();
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      if (folder) input.webkitdirectory = true;
      // In the page, out of sight: iOS (Safari, and every browser there, all being WebKit) delivers no change event to
      // a file input that was never put in the document - the pick went nowhere, and nothing was said.
      input.style.cssText = 'position:fixed;left:-1000px;top:0;width:1px;height:1px;opacity:0';
      root.appendChild(input);
      input.addEventListener('change', () => {
        const files = [...(input.files ?? [])];
        input.remove();
        if (files.length) void tryInstall(() => fromFiles(files));
      });
      input.addEventListener('cancel', () => input.remove());
      input.click();
    };
    root.querySelector('[data-warn="install"]')!.addEventListener('click', () => {
      if (waiting)
        void install(waiting).catch(
          (e: unknown) => (status.textContent = `Could not install: ${e instanceof Error ? e.message : String(e)}`),
        );
    });
    root.querySelector('[data-warn="again"]')!.addEventListener('click', chooseAgain);
    root.querySelector('[data-pick="folder"]')!.addEventListener('click', () => pick(true));
    root.querySelector('[data-pick="files"]')!.addEventListener('click', () => pick(false));
    root.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    root.addEventListener('dragleave', () => drop.classList.remove('over'));
    root.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      if (e.dataTransfer) {
        const dt = e.dataTransfer;
        // The entries must be taken before the event returns.
        const pending = fromDataTransfer(dt);
        void tryInstall(() => pending);
      }
    });
  });
}
