export function updateKind(where: {
  packaged: boolean;
  platform: string;
  env: Record<string, string | undefined>;
  argv: string[];
}): 'auto' | 'notice' | 'none';
export function isNewer(latest: string, current: string): boolean;
export function shouldNotice(latest: string, current: string, told: string | null): boolean;
export function checkForUpdates(o: { electron: unknown; win: unknown; quiet: boolean }): Promise<void>;
export const RELEASES: string;
