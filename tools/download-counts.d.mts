export type DownloadKind = 'setup' | 'portable' | 'zip';
export type DownloadCounts = Record<DownloadKind, number>;
export interface CountLedger {
  base: DownloadCounts;
  folded: Record<string, number>;
}
export interface ReleaseAsset {
  id: number;
  name: string;
  download_count: number;
}

export const RELEASE_TAG: string;
export const OFFLINE_ZIP: string;
export function kindOfAsset(name: string): DownloadKind | null;
export function readLedger(body: string | null | undefined): CountLedger;
export function totalCounts(ledger: CountLedger, assets: ReleaseAsset[] | null | undefined): DownloadCounts;
export function foldAssets(ledger: CountLedger, assets: ReleaseAsset[] | null | undefined): CountLedger;
export function releaseNotes(version: string, ledger: CountLedger): string;
export function countsFromRelease(release: { body?: string | null; assets?: ReleaseAsset[] } | null | undefined): DownloadCounts | null;
