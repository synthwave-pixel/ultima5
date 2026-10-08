// The page's one way to the disk (web/src/install/sources.ts desktopScan): a scan for the player's copy of Ultima V,
// made by the main process (scan.cjs). The page stays sandboxed and isolated; this is all it is given.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('u5native', {
  scanForGameFiles: (names) => ipcRenderer.invoke('scan-game-files', names),
});
