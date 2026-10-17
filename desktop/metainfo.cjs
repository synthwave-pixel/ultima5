// The AppStream metainfo the Flatpak carries (dist.cjs writes it before each build, for electron-builder's
// flatpak.files to put in /share/metainfo): what Discover and GNOME Software show of the game - its name, summary,
// description and screenshot, and the version installed and offered as an update. Without it they named the
// Flatpak's branch, "master", where the version goes.
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const ID = "com.synthwavepixel.ultima5";
const SITE = "https://synthwave-pixel.github.io/ultima5/";
const REPO = "https://github.com/synthwave-pixel/ultima5";

/** The metainfo for `version`, released on `date` (YYYY-MM-DD). */
function metainfo(version, date) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${ID}</id>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>
  <name>Ultima V</name>
  <summary>A new engine for Ultima V: Warriors of Destiny</summary>
  <developer id="io.github.synthwave-pixel">
    <name>synthwave-pixel</name>
  </developer>
  <description>
    <p>A new engine for the 1988 role-playing game Ultima V: Warriors of Destiny. It plays your own copy of the MS-DOS game, which it does not include: point it at a GOG installation, the game's folder or a .zip of its files.</p>
    <p>Play it with a controller, a keyboard or a touch screen, in the original look or a modern one, with a map that fills in as you explore, a journal of the quest and the clues you have heard, and the 1988 game's bugs fixed.</p>
  </description>
  <launchable type="desktop-id">${ID}.desktop</launchable>
  <url type="homepage">${SITE}</url>
  <url type="bugtracker">${REPO}/issues</url>
  <url type="vcs-browser">${REPO}</url>
  <screenshots>
    <screenshot type="default">
      <image>https://raw.githubusercontent.com/synthwave-pixel/ultima5/main/promo/features.jpg</image>
    </screenshot>
  </screenshots>
  <categories>
    <category>Game</category>
    <category>RolePlaying</category>
  </categories>
  <content_rating type="oars-1.1">
    <content_attribute id="violence-fantasy">moderate</content_attribute>
  </content_rating>
  <releases>
    <release version="${version}" date="${date}">
      <url type="details">${REPO}/releases/tag/v${version}</url>
    </release>
  </releases>
</component>
`;
}

/** Writes the metainfo for `version`, dated today (UTC), where package.json's flatpak.files looks for it. */
function writeMetainfo(version) {
  const dir = join(__dirname, "build-meta");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${ID}.metainfo.xml`);
  writeFileSync(file, metainfo(version, new Date().toISOString().slice(0, 10)));
  return file;
}

module.exports = { metainfo, writeMetainfo };
