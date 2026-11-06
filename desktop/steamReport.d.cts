/** What the report is made from: gathered by main.cjs, plain values only (no save or file contents). */
export interface ReportFacts {
  version: string;
  /** 'mac', 'windows' or 'linux'. */
  system: string;
  arch: string;
  /** 'installed', 'portable', 'AppImage', 'Flatpak' or 'development'. */
  build: string;
  /** The player's home folder, which the report writes as ~. */
  home: string;
  bySteam: boolean;
  /** The environment variables the report names; SteamUser is only ever said to be set or not. */
  env: Record<string, string | undefined>;
  /** Steam's folder (null: none found) and the library folders it lists. */
  steamRoot: string | null;
  libraries: string[];
  /** 'ok' (installed), 'missing' (listed, its folder is gone) or 'none'; `where` is the folder or the library expected. */
  game: 'ok' | 'missing' | 'none';
  where: string;
  /** Where the engine's kept game files came from, as the page recorded it. */
  filesFrom: 'steam' | 'installer' | 'unknown';
  /** How many required game files Steam's folder lacks (0: complete; null: no folder to look in). */
  steamMissing: number | null;
  options: {
    playLine: boolean;
    compatTool: boolean;
    macPlay: boolean;
    results: Record<string, string>;
  };
  /** Cloud saves for the account of this launch; null where no account is known. */
  cloud: boolean | null;
  accountKnown: boolean;
  /** A launch-line check's state (main.cjs steamLineState), or null. */
  lineState: string | null;
  /** On a Mac: whether Ultima V's cache entry is patched (null: unknown) and whether this start had to re-apply it. */
  macPatched: boolean | null;
  macReapplied: boolean | null;
  /** Characters in Steam's folder (null: Cloud saves off or the folder is unreadable). */
  cloudCharacters: number | null;
}
/** Hides what identifies the player in `text`: `home` becomes ~, user names in paths become <user>. */
export function mask(text: string, home: string): string;
/** The plain-text report. */
export function report(facts: ReportFacts): string;
