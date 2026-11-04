export interface ReleaseEntry {
  version: string;
  notes: string[];
  current: boolean;
  date: string | null;
  setup: { name: string; size: number } | null;
}

export function readReleases(root: string, currentVersion: string): ReleaseEntry[];
