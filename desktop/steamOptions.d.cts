/** The Steam options, each off until turned on. `cloud` is per Steam account id; `results` is each option's last on/off result; `lineOnAt` is when a launch-line option was last turned on (ms since 1970, 0 never). */
export interface SteamOptions {
  playLine: boolean;
  compatTool: boolean;
  macPlay: boolean;
  cloud: Record<string, boolean>;
  results: Record<string, string>;
  lineOnAt: number;
}
/** What `file` holds; all off where it is missing or unreadable. */
export function readOptions(file: string): SteamOptions;
/** `o` written to `file`, whole or not at all: whether it was. */
export function writeOptions(file: string, o: SteamOptions): boolean;
/** What turning an option on or off does on this system (main.cjs: Steam's own folders, steamSetup.cjs). */
export interface OptionEffects {
  /** The launch line for this copy, or null where it has none. */
  line(): string | null;
  /** The compatibility tool written: the folders it went in (none: no Steam), or null where it has nothing to start. */
  installTool(): string[] | null;
  removeTool(): void;
  macSetup(): Promise<'done' | 'steam-running' | 'not-owned' | 'app-not-in-place'>;
  macRestore(): Promise<'done' | 'steam-running' | 'kept-unusable'>;
}
/** An option switched: the options now (to be written), whether it is on, what to say, and a launch line to show. */
export interface Switched {
  options: SteamOptions;
  on: boolean;
  message: string;
  line?: string;
}
/** Option `name` turned on or off with its effect here, its result kept; null for one this system has not. */
export function switchOption(args: {
  options: SteamOptions;
  name: string;
  on: boolean;
  system: string;
  account: string | null;
  now: number;
  /** Cloud saves: why the page's copy failed, the option left as it was. */
  failed?: string;
  effects: OptionEffects;
}): Promise<Switched | null>;
/** An option switched and the options written to `file`, as the page is told; where they can't be written, the option as it was. */
export function switchAndKeep(
  file: string,
  args: Parameters<typeof switchOption>[0],
): Promise<{ on: boolean; message: string; line?: string } | null>;
