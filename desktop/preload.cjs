// The page's bridge to the app: a newer version (updates.cjs), a scan for the player's copy of Ultima V, made by the main process (scan.cjs; web/src/
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
