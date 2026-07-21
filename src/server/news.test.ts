import { describe, expect, it } from 'vitest';
import { dedupeStories, normalizeTitle } from './news';
import type { GeoItem, LayerId } from '../types';

let n = 0;
function item(partial: Partial<GeoItem> & { layer: LayerId; severity: number }): GeoItem {
  return {
    id: partial.id ?? `id-${n++}`,
    lon: 0,
    lat: 0,
    title: 'x',
    ...partial,
  } as GeoItem;
}

describe('normalizeTitle', () => {
  it('lowercases, strips punctuation, and keeps the leading words', () => {
    expect(normalizeTitle('Offshore RIG blowout sparks fire!')).toBe('offshore rig blowout sparks fire');
  });
  it('treats smart quotes and hyphens as separators', () => {
    expect(normalizeTitle('BP’s well-control incident')).toBe('bps well control incident');
  });
});

describe('dedupeStories', () => {
  it('collapses the same URL to one item, keeping the higher severity', () => {
    const merged = dedupeStories([
      [item({ layer: 'incidents', severity: 2, url: 'https://a/x', title: 'Refinery fire' })],
      [item({ layer: 'incidents', severity: 5, url: 'https://a/x?utm=1', title: 'Refinery fire (update)' })],
    ]);
    const all = [...merged.values()].flat();
    expect(all).toHaveLength(1);
    expect(all[0].severity).toBe(5);
  });

  it('collapses the same headline across layers to the higher-severity layer', () => {
    const merged = dedupeStories([
      [item({ layer: 'incidents', severity: 6, url: 'https://a/1', title: 'Missile hits Baku oil depot' })],
      [item({ layer: 'conflict', severity: 3, url: 'https://b/2', title: 'Missile hits Baku oil depot' })],
    ]);
    const all = [...merged.values()].flat();
    expect(all).toHaveLength(1);
    expect(all[0].layer).toBe('incidents');
  });

  it('breaks severity ties by placement precision', () => {
    const merged = dedupeStories([
      [item({ layer: 'incidents', severity: 3, url: 'https://a/1', title: 'Blast at plant', meta: { precision: 'country' } })],
      [item({ layer: 'conflict', severity: 3, url: 'https://b/2', title: 'Blast at plant', meta: { precision: 'city' } })],
    ]);
    const all = [...merged.values()].flat();
    expect(all).toHaveLength(1);
    expect(all[0].meta?.precision).toBe('city');
  });

  it('keeps genuinely distinct stories', () => {
    const merged = dedupeStories([
      [item({ layer: 'incidents', severity: 2, title: 'Spill off the coast of Angola' })],
      [item({ layer: 'incidents', severity: 2, title: 'Ransomware hits a grid operator' })],
    ]);
    expect([...merged.values()].flat()).toHaveLength(2);
  });

  it('re-sorts each layer by severity', () => {
    const merged = dedupeStories([
      [
        item({ layer: 'cyber', severity: 1.5, title: 'Minor breach' }),
        item({ layer: 'cyber', severity: 4, title: 'Major SCADA ransomware' }),
      ],
    ]);
    const cyber = merged.get('cyber')!;
    expect(cyber[0].severity).toBe(4);
  });
});
