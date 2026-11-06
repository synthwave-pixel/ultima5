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
/** `o` written to `file`, whole or not at all. */
export function writeOptions(file: string, o: SteamOptions): void;
