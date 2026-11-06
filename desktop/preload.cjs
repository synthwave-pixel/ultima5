// The page's bridge to the app: a Steam launch's saves, a newer version (updates.cjs), a scan for the player's copy of Ultima V, made by the main process (scan.cjs; web/src/
// install/sources.ts desktopScan), and the window's full screen, for the touch pad's button (web/src/ui/fullScreen.ts).
// The page stays sandboxed and isolated; this is all it is given.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('u5native', {
  scanForGameFiles: (names) => ipcRenderer.invoke('scan-game-files', names),
  // A newer version (updates.cjs; web/src/ui/updates.ts): what it is, taking it up, the player told of it.
  updates: {
    offer: () => ipcRenderer.invoke('update-offer'),
    apply: () => ipcRenderer.invoke('update-apply'),
    told: () => ipcRenderer.invoke('update-told'),
    /** Told each time it changes. Returns nothing (ipcRenderer.on's own return must never reach the page). */
    onChange: (listener) => {
      ipcRenderer.on('update-offer-changed', (_event, offer) => listener(offer));
    },
    /** The first start of a newer version ({ version, from }, or null), the player told of it, and a release's notes. */
    news: () => ipcRenderer.invoke('update-news'),
    newsSeen: () => ipcRenderer.invoke('update-news-seen'),
    notes: (version) => ipcRenderer.invoke('update-notes', version),
  },
  steam: {
    // Whether Steam launched the game, and what it found (main.cjs steamLaunch): { steam: false }, or { steam: true,
    // game: 'ok' | 'missing' | 'none', where, account }. And the game's files from the folder it gave.
    launch: () => ipcRenderer.sendSync('steam-launch'),
    // Steam's libraries and Ultima V in them, found whether or not Steam launched the app (main.cjs steamFind).
    find: () => ipcRenderer.sendSync('steam-find'),
    gameFiles: (names) => ipcRenderer.invoke('steam-game-files', names),
    // The Steam line in Settings (main.cjs): where this system stands, setting up, removing, and the launch line to copy.
    status: () => ipcRenderer.invoke('steam-status'),
    setup: () => ipcRenderer.invoke('steam-setup'),
    remove: () => ipcRenderer.invoke('steam-remove'),
    launchLine: () => ipcRenderer.invoke('steam-launch-line'),
    // Whether Steam's saved launch line is this copy's: { state: 'correct' | 'missing' | 'not-seen' | 'stale' | 'twice', bothLinux }, or null (main.cjs steamLineState).
    lineState: () => ipcRenderer.invoke('steam-line-state'),
    // The plain-text report for testers to paste into an issue (main.cjs reportFacts, steamReport.cjs). The page gives
    // what only it knows: { filesFrom, required } (web/src/install/sources.ts reportArgs).
    report: (page) => ipcRenderer.invoke('steam-report', page),
    // The Steam options kept on this machine (main.cjs), with this launch's Steam account id or null; and a switch.
    options: () => ipcRenderer.sendSync('steam-options'),
    setOption: (name, on) => ipcRenderer.invoke('steam-set-option', name, on),
    // A Steam launch's saves, as files (main.cjs, web/src/game/keyStore.ts). Synchronous, so that a save the disk
    // refuses fails at once. `all` is every key kept, or null where there is nowhere to keep them. `set` says true, or
    // why the write was refused (the system's code, 'ENOSPC' for a full disk), or false.
    saves: {
      all: () => ipcRenderer.sendSync('steam-saves-all'),
      set: (key, value) => {
        const written = ipcRenderer.sendSync('steam-saves-set', key, value);
        return written === true || typeof written === 'string' ? written : false;
      },
      remove: (key) => ipcRenderer.sendSync('steam-saves-remove', key) === true,
    },
  },
  fullScreen: {
    /** Whether the window is full screen; made so first if `on` is given. */
    set: (on) => ipcRenderer.invoke('full-screen', on),
    get: () => ipcRenderer.invoke('full-screen'),
    /** Told each time the window goes full screen or leaves it, by any means. Returns nothing: ipcRenderer.on's own
     * return is ipcRenderer, which must never reach the page. */
    onChange: (listener) => {
      ipcRenderer.on('full-screen-changed', (_event, on) => listener(on === true));
    },
  },
});

// Quitting while the Flatpak's update comes down (main.cjs holdForUpdate): said over the game until it is done.
ipcRenderer.on('update-finishing', () => {
  const note = document.createElement('div');
  note.textContent = 'Finishing the update\u2026';
  note.setAttribute('role', 'status');
  Object.assign(note.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.75)',
    color: '#fff',
    font: '24px sans-serif',
    zIndex: '2147483647',
  });
  document.body.appendChild(note);
});
