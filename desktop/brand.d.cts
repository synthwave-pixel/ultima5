/** What a game gives: brand.cjs's values. */
export interface BrandValues {
  id: string;
  name: string;
  title: string;
  appId: string;
  repo: string;
  global: string;
  about: readonly string[];
  steam: { appId: string; installDir: string; saveFile: string };
  scan: { folder: RegExp; marker: string };
}
/** The values and the names derived from them. */
export interface Brand extends BrandValues {
  steam: BrandValues['steam'] & { saves: string; tool: string; launcher: string };
  edition: string;
  summary: string;
  artifact: string;
  appImage: string;
  portableData: string;
  launcherId: string;
  owner: string;
  repoName: string;
  site: string;
  brandOf(values: BrandValues): Brand;
}
declare const brand: Brand;
export = brand;
