export const APP_ID: string;
export function isSteamLaunch(env: Record<string, string | undefined>): boolean;
export function parseVdf(text: string): Record<string, unknown>;
export function steamRoots(where: {
  platform: string;
  home: string;
  env: Record<string, string | undefined>;
  registrySteamPath?: string | null;
}): string[];
export function libraryPaths(root: string, read: (path: string) => string | null): string[];
export function findGame(
  roots: string[],
  read: (path: string) => string | null,
  exists: (path: string) => boolean,
): { library: string; folder: string } | { missing: string } | null;
export function accountId(
  root: string,
  env: Record<string, string | undefined>,
  read: (path: string) => string | null,
): string | null;
export function saveDir(gameFolder: string, account: string): string;
