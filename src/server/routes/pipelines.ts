// Pipeline overlay geometry — schematic routes for the major oil & gas lines in
// the curated tracker (src/server/data/trackers.json), joined to approximate
// endpoint coordinates here. Straight segments (endpoint → endpoint), colored by
// status; a schematic reference overlay, not surveyed right-of-way. Keyless.
import { cached } from '../util';
import type { PipelinesResult } from '../../types';
import dataset from '../data/trackers.json';

// name (must match trackers.json) → [ [fromLon,fromLat], [toLon,toLat] ]
const COORDS: Record<string, [[number, number], [number, number]]> = {
  Druzhba: [[52.0, 53.2], [19.0, 48.7]],
  'Nord Stream 1': [[28.75, 60.7], [13.4, 54.1]],
  'Nord Stream 2': [[28.3, 59.7], [13.4, 54.1]],
  TurkStream: [[37.3, 44.9], [28.1, 41.6]],
  'Power of Siberia': [[112.0, 61.0], [127.5, 50.3]],
  'Yamal–Europe': [[68.0, 66.0], [14.5, 52.3]],
  ESPO: [[98.0, 56.0], [132.9, 42.9]],
  'Trans-Alaska (TAPS)': [[-148.3, 70.2], [-146.3, 61.1]],
  Keystone: [[-111.3, 52.7], [-96.8, 36.0]],
  Colonial: [[-95.4, 29.8], [-74.2, 40.6]],
  'Baku–Tbilisi–Ceyhan': [[49.9, 40.4], [35.8, 36.9]],
  'Trans Mountain': [[-113.5, 53.5], [-123.0, 49.3]],
  'TransMed (Enrico Mattei)': [[8.1, 33.9], [14.0, 37.5]],
  Medgaz: [[-1.4, 35.3], [-2.5, 36.8]],
  'Maghreb–Europe (GME)': [[-1.0, 35.0], [-4.8, 37.9]],
  'Trans Adriatic (TAP)': [[20.9, 40.6], [18.4, 40.1]],
  'Arab Gas Pipeline': [[32.3, 31.0], [36.0, 33.5]],
};

export async function handler(): Promise<PipelinesResult> {
  return cached('pipelines', 60 * 60 * 1000, async () => {
    const lines = (dataset.pipelines as any[])
      .filter((p) => COORDS[p.name])
      .map((p) => ({
        name: String(p.name),
        status: String(p.status),
        path: COORDS[p.name] as number[][],
      }));
    return { lines };
  });
}
