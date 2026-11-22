import type { Brand } from './brand.cjs';
/** electron-builder's config, filled: the game's fields as builderConfig sets them, and package.json's others. */
export interface FilledBuild {
  appId: string;
  productName: string;
  artifactName: string;
  extraMetadata: { version: string; [key: string]: unknown };
  publish: { provider: string; owner: string; repo: string; releaseType: string }[];
  mac: { extendInfo: Record<string, string>; [key: string]: unknown };
  nsis: { artifactName: string; [key: string]: unknown };
  portable: { artifactName: string; [key: string]: unknown };
  linux: { desktop: { entry: { Name: string; Comment: string } }; [key: string]: unknown };
  appImage: { artifactName: string; [key: string]: unknown };
  flatpak: { files: string[][]; finishArgs?: string[]; [key: string]: unknown };
  files?: string[];
  win?: unknown;
  [key: string]: unknown;
}
/** `build` (package.json's) filled from the brand (brand.cjs, or `brand` given), at `version`. A copy. */
export function builderConfig(build: Record<string, unknown>, version: string, brand?: Brand): FilledBuild;
