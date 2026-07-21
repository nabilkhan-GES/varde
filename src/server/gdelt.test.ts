import { describe, expect, it } from 'vitest';
import { articlesToGeoItems, parseSeenDate } from './gdelt';

describe('parseSeenDate', () => {
  it('parses GDELT compact timestamps', () => {
    expect(parseSeenDate('20260721T101500Z')).toBe(Date.UTC(2026, 6, 21, 10, 15, 0));
  });
  it('falls back to Date.parse for ISO strings', () => {
    expect(parseSeenDate('2026-07-21T08:00:00Z')).toBe(Date.parse('2026-07-21T08:00:00Z'));
  });
  it('returns undefined for junk / empty', () => {
    expect(parseSeenDate('')).toBeUndefined();
    expect(parseSeenDate('nope')).toBeUndefined();
  });
});

describe('articlesToGeoItems', () => {
  it('geocodes by title when a place is named (city precision)', () => {
    const [it] = articlesToGeoItems(
      [{ title: 'Explosion at a Rotterdam terminal', url: 'https://x/1', sourcecountry: 'Netherlands' }],
      'incidents',
    );
    expect(it.meta?.precision).toBe('city');
    expect(it.lon).toBeCloseTo(4.48, 0);
    expect(it.severity).toBeGreaterThan(1);
  });

  it('falls back to the source-country centroid when the title has no place', () => {
    const [it] = articlesToGeoItems(
      [{ title: 'Regulator opens probe into pipeline operator', url: 'https://x/2', sourcecountry: 'Norway' }],
      'incidents',
    );
    expect(it.meta?.precision).toBe('country');
    expect(Math.abs(it.lon - 8.5)).toBeLessThanOrEqual(1.6); // Norway centroid ± country jitter
    expect(Math.abs(it.lat - 60.5)).toBeLessThanOrEqual(1.6);
  });

  it('drops articles with neither a title place nor a known source country', () => {
    const items = articlesToGeoItems(
      [{ title: 'Markets rally on rate hopes', url: 'https://x/3', sourcecountry: 'Atlantis' }],
      'incidents',
    );
    expect(items).toHaveLength(0);
  });

  it('tags source and layer', () => {
    const [it] = articlesToGeoItems(
      [{ title: 'Fire in Houston', url: 'https://x/4', sourcecountry: 'United States' }],
      'conflict',
    );
    expect(it.meta?.source).toBe('gdelt');
    expect(it.layer).toBe('conflict');
  });
});
