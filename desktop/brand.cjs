// The game's names and ids, as the desktop app, its packages, its Steam setup and its scan give them, in one place
// (the page's own are web/src/brand.ts). Every desktop module reads them here, and dist.cjs fills electron-builder's
// config from them (builderConfig.cjs), so a fork for another game on this engine changes the values below, and
// package.json's name, productName, description and repository to match (desktopBrand.test.ts), and nothing else.
// The names derived from them (brandOf) are those this engine has always given a game: its edition, its AppImage, its
// saves folder in Steam, its compatibility tool, its Mac launcher, its artifacts' prefix, its site. The internal names
// no player sees stay as they are whatever the game: u5native (preload.cjs), ULTIMA5_SMOKE, the app:// host (main.cjs).

/** The brand of the game `v` names: its values, and the names derived from them. Frozen. */
function brandOf(v) {
  const [owner, repoName] = v.repo.split('/');
  return Object.freeze({
    ...v,
    steam: Object.freeze({
      ...v.steam,
      /** Where a Steam launch keeps its saves, in the game's folder (steam.cjs saveDir). As the page says it. */
      saves: `${v.id}-sp`,
      /** The Linux compatibility tool's folder in compatibilitytools.d (steamSetup.cjs). */
      tool: `${v.id}_sp`,
      /** The Mac launcher .app (and its executable) in the game's folder, which Steam's Mac launch runs. */
      launcher: `${v.name} SP`,
    }),
    scan: Object.freeze({ ...v.scan }),
    about: Object.freeze([...v.about]),
    /** The window's title (with the version), the Steam tool's and the Mac launch's name, the report's heading. */
    edition: `${v.name} Enhanced Edition`,
    /** The Flatpak's one-line summary. */
    summary: `A new engine for ${v.title}`,
    /** What every installer and archive is named from: Ultima-V-<version>-<os>-<arch>.<ext>. */
    artifact: v.name.replace(/\s+/g, '-'),
    /** The AppImage, without a version so an update overwrites it in place: <appImage>-<arch>.AppImage. */
    appImage: `${v.id}-sp`,
    /** The portable .exe's data folder, beside it (portable.cjs). */
    portableData: `${v.name} Data`,
    /** The Mac launcher's bundle id. */
    launcherId: `${v.appId}.steam`,
    owner,
    repoName,
    /** The site on GitHub Pages, with its trailing slash. */
    site: `https://${owner}.github.io/${repoName}/`,
    brandOf,
  });
}

module.exports = brandOf({
  /** The page's GAME_ID: its storage keys' prefix, which the app reads in a Steam launch's saves. */
  id: 'ultima5',
  /** The game's name: the product, the app's data folder, and every message that names the game. */
  name: 'Ultima V',
  /** Its full title: the package's description, the Linux menu entry's comment, the Flatpak's. */
  title: 'Ultima V: Warriors of Destiny',
  /** The app id on every system: the Mac bundle, the Windows installer, the Flatpak. */
  appId: 'com.synthwavepixel.ultima5',
  /** The GitHub repository the releases (and updates) and issues are on, as the page's REPO. */
  repo: 'synthwave-pixel/ultima5',
  /** The global a running game sets on the page (web/src/main.ts), which the smoke test waits for. */
  global: 'u5',
  /** The Flatpak's description, a paragraph each, as Discover and GNOME Software show it. */
  about: [
    "A new engine for the 1988 role-playing game Ultima V: Warriors of Destiny. It plays your own copy of the MS-DOS game, which it does not include: point it at a GOG installation, the game's folder or a .zip of its files.",
    "Play it with a controller, a keyboard or a touch screen, in the original look or a modern one, with a map that fills in as you explore, a journal of the quest and the clues you have heard, and the 1988 game's bugs fixed.",
  ],
  steam: {
    /** The game's app id in Steam. */
    appId: '3067520',
    /** Its folder in a library's steamapps/common (the app manifest's installdir). */
    installDir: 'Ultima V',
    /** The one name every save file of a Steam launch has, which the game's cloud rule syncs (steamSaves.cjs). */
    saveFile: 'SAVED.GAM',
  },
  scan: {
    /** A folder named like the game: u5, ultima5, Ultima 5, Ultima V, with a trademark sign, an extension or more after. */
    folder: /^(u5|ultima[\s_-]*(5|v))(?![a-z0-9])/i,
    /** The file a copy of the game is known by. */
    marker: 'DATA.OVL',
  },
});
