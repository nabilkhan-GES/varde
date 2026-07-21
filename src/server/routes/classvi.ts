// Class VI (CO2 geologic sequestration) permit tracker — the flagship layer.
// Backed by a curated, sourced snapshot (src/server/data/classvi.json); swap in
// the live EPA GSDT / state-primacy feed here when one is available (ROADMAP v0.3).
import { cached } from '../util';
import type { ClassViResult, GeoItem } from '../../types';
import dataset from '../data/classvi.json';

// Status → severity (drives marker radius + tracker ordering).
const STATUS_SEVERITY: Record<string, number> = {
  operating: 2.6,
  constructing: 2.0,
  permitted: 1.8,
  'under-review': 1.3,
};
const STATUS_ORDER: Record<string, number> = {
  operating: 0,
  constructing: 1,
  permitted: 2,
  'under-review': 3,
};

export async function handler(): Promise<ClassViResult> {
  return cached('classvi', 60 * 60 * 1000, async () => {
    const wells: GeoItem[] = (dataset.wells as any[])
      .map((w) => ({
        id: `classvi:${w.name}`,
        layer: 'classvi' as const,
        lon: Number(w.lon),
        lat: Number(w.lat),
        title: String(w.name),
        place: `${w.city}, ${w.state}`,
        severity: STATUS_SEVERITY[w.status] ?? 1.2,
        kind: String(w.status),
        meta: { operator: w.operator, wells: w.wells, authority: w.authority, status: w.status },
      }))
      .sort(
        (a, b) =>
          (STATUS_ORDER[a.kind ?? ''] ?? 9) - (STATUS_ORDER[b.kind ?? ''] ?? 9) ||
          a.title.localeCompare(b.title),
      );
    return { wells, asOf: dataset._meta.asOf, note: dataset._meta.note };
  });
}
