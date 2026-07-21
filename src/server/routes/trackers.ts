// Curated energy-infrastructure trackers — oil & gas pipeline status, strategic
// storage atlas, and an energy-supply crisis registry. Backed by a curated,
// sourced snapshot (src/server/data/trackers.json), same model as the Class VI
// tracker: NOT a live feed. Sort pipelines/storage/crisis so the most
// significant (impaired / largest / most severe) surface first.
import { cached } from '../util';
import type { CrisisRow, PipelineRow, StorageRow, TrackersResult } from '../../types';
import dataset from '../data/trackers.json';

// Impaired pipelines are the news, so they sort above healthy ones.
const PIPE_STATUS_RANK: Record<string, number> = {
  offline: 0,
  closed: 1,
  idle: 2,
  reduced: 3,
  operating: 4,
};
const CRISIS_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export async function handler(): Promise<TrackersResult> {
  return cached('trackers', 60 * 60 * 1000, async () => {
    const pipelines = [...(dataset.pipelines as PipelineRow[])].sort(
      (a, b) =>
        (PIPE_STATUS_RANK[a.status] ?? 9) - (PIPE_STATUS_RANK[b.status] ?? 9) ||
        (b.capacity ?? 0) - (a.capacity ?? 0),
    );
    const storage = [...(dataset.storage as StorageRow[])].sort(
      (a, b) => (b.capacity ?? -1) - (a.capacity ?? -1),
    );
    const crisis = [...(dataset.crisis as CrisisRow[])].sort(
      (a, b) => (CRISIS_RANK[a.severity] ?? 9) - (CRISIS_RANK[b.severity] ?? 9),
    );
    return { asOf: dataset._meta.asOf, note: dataset._meta.note, pipelines, storage, crisis };
  });
}
