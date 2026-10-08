export interface SteamArtResult {
  result: string;
  id?: number;
  grids?: string[];
  written?: number;
  kept?: number;
  failed?: number;
  replaced?: number;
  notes: string[];
}
export const ART: [string, string][];
export const SHIPPED: Record<string, string[]>;
export function shortcutId(env: Record<string, string | undefined>): number | null;
export function steamRoots(where: { platform: string; home: string; env: Record<string, string | undefined> }): string[];
export function listsShortcut(vdf: Uint8Array, id: number): boolean;
export function installSteamArt(where: {
  env: Record<string, string | undefined>;
  home: string;
  platform: string;
  artDir: string;
  noteFile: string;
  roots?: string[];
  shipped?: Record<string, string[]>;
}): Promise<SteamArtResult>;
