/** The Flatpak's AppStream metainfo for `version`, released on `date` (YYYY-MM-DD). */
export function metainfo(version: string, date: string): string;
/** Writes it for `version`, dated today, where the Flatpak build looks for it; its path. */
export function writeMetainfo(version: string): string;
/** The Flatpak repository's .flatpakrepo and .flatpakref, and its title. */
export function flatpakRepoFiles(where: { site: string; id: string; branch: string; key: string }): {
  title: string;
  repo: { name: string; text: string };
  ref: { name: string; text: string };
};
