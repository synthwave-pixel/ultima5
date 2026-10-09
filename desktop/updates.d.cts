export function updateKind(where: {
  packaged: boolean;
  platform: string;
  env: Record<string, string | undefined>;
  argv: string[];
}): 'auto' | 'notice' | 'none';
export function isNewer(latest: string, current: string): boolean;
export function shouldNotice(latest: string, current: string, told: string | null): boolean;
/** What there is to update to (web/src/ui/updates.ts UpdateOffer). */
export interface UpdateOffer {
  kind: 'restart' | 'release';
  version?: string;
  current?: string;
  told: boolean;
}
export function checkForUpdates(o: { electron: unknown; quiet: boolean; file: string }): Promise<void>;
export function applyUpdate(o: { electron: unknown }): boolean;
export function toldOfUpdate(o: { file: string }): void;
export function currentOffer(): UpdateOffer | null;
export function onOffer(listener: (offer: UpdateOffer | null) => void): void;
export const RELEASES: string;
