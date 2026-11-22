// The AppStream metainfo the Flatpak carries (dist.cjs writes it before each build, for electron-builder's
// flatpak.files to put in /share/metainfo): what Discover and GNOME Software show of the game - its name, summary,
// description and screenshot, and the version installed and offered as an update. Without it they named the
// Flatpak's branch, "master", where the version goes. And the files beside the Flatpak repository the site serves
// (flatpak-repo.sh): the .flatpakrepo and .flatpakref that add it. All of it the game's, from brand.cjs.
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const brand = require("./brand.cjs");

const ID = brand.appId;
const SITE = brand.site;
const REPO = `https://github.com/${brand.repo}`;
/** Text as XML's character data. */
const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The metainfo for `version`, released on `date` (YYYY-MM-DD). */
function metainfo(version, date) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${ID}</id>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>
  <name>${xml(brand.name)}</name>
  <summary>${xml(brand.summary)}</summary>
  <developer id="io.github.synthwave-pixel">
    <name>synthwave-pixel</name>
  </developer>
  <description>
${brand.about.map((p) => `    <p>${xml(p)}</p>\n`).join("")}  </description>
  <launchable type="desktop-id">${ID}.desktop</launchable>
  <url type="homepage">${SITE}</url>
  <url type="bugtracker">${REPO}/issues</url>
  <url type="vcs-browser">${REPO}</url>
  <screenshots>
    <screenshot type="default">
      <image>https://raw.githubusercontent.com/${brand.repo}/main/promo/features.jpg</image>
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

/**
 * The Flatpak repository's two files for the site at `site` (no trailing slash), serving app `id` on `branch`, signed
 * with `key` (the public key, base64): the .flatpakrepo that adds the repository, the .flatpakref that adds it and
 * installs the game, named for the remote they suggest; and the repository's title.
 */
function flatpakRepoFiles({ site, id, branch, key }) {
  return {
    title: brand.name,
    repo: {
      name: `${brand.id}.flatpakrepo`,
      text: `[Flatpak Repo]
Title=${brand.name}
Url=${site}/flatpak/
Homepage=${site}/
Comment=${brand.title}
Description=${brand.summary}; plays the DOS game's files, installed by the player.
GPGKey=${key}
`,
    },
    ref: {
      name: `${brand.id}.flatpakref`,
      text: `[Flatpak Ref]
Title=${brand.name}
Name=${id}
Branch=${branch}
Url=${site}/flatpak/
SuggestRemoteName=${brand.id}
Homepage=${site}/
IsRuntime=false
RuntimeRepo=https://dl.flathub.org/repo/flathub.flatpakrepo
GPGKey=${key}
`,
    },
  };
}

module.exports = { metainfo, writeMetainfo, flatpakRepoFiles };

// flatpak-repo.sh's: `node metainfo.cjs title` prints the repository's title, `node metainfo.cjs repo-files <out> <site>
// <id> <branch> <key>` writes the two files into <out>.
if (require.main === module) {
  const [what, out, site, id, branch, key] = process.argv.slice(2);
  if (what === "title") console.log(brand.name);
  else if (what === "repo-files") {
    const files = flatpakRepoFiles({ site, id, branch, key });
    for (const f of [files.repo, files.ref]) writeFileSync(join(out, f.name), f.text);
  } else {
    console.error("usage: metainfo.cjs title | repo-files <out> <site> <id> <branch> <key>");
    process.exit(2);
  }
}
