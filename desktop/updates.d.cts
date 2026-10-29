export function updateKind(where: {
  packaged: boolean;
  platform: string;
  env: Record<string, string | undefined>;
  argv: string[];
}): "auto" | "notice" | "flatpak" | "none";
export function isNewer(latest: string, current: string): boolean;
export function shouldNotice(
  latest: string,
  current: string,
  told: string | null,
): boolean;
/** What there is to update to (web/src/ui/updates.ts UpdateOffer). */
export interface UpdateOffer {
  kind: "restart" | "release";
  version?: string;
  current?: string;
  told: boolean;
  installed?: boolean;
  quits?: boolean;
  page?: boolean;
}
/** Flatpak's update portal (flatpakUpdates.cjs), as checkForUpdates takes it. */
export interface FlatpakPortal {
  connect: typeof import("./flatpakUpdates.cjs").connect;
  watch: typeof import("./flatpakUpdates.cjs").watch;
}
export function checkForUpdates(o: {
  electron: unknown;
  quiet: boolean;
  file: string;
  flatpak?: FlatpakPortal;
}): Promise<void>;
export function applyUpdate(o: { electron: unknown }): boolean;
export function toldOfUpdate(o: { file: string }): void;
export function currentOffer(): UpdateOffer | null;
export function onOffer(listener: (offer: UpdateOffer | null) => void): void;
export const RELEASES: string;
