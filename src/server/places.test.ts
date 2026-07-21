import { describe, expect, it } from 'vitest';
import { geocodeDetailed, precisionJitter } from './places';

describe('geocodeDetailed', () => {
  it('resolves a city to the city tier', () => {
    const g = geocodeDetailed('Refinery fire reported in Houston overnight');
    expect(g?.precision).toBe('city');
    expect(g?.coord[0]).toBeCloseTo(-95.37, 1);
  });

  it('prefers the most specific place when several match', () => {
    // "Houston" (city) should win over "United States" (country).
    const g = geocodeDetailed('United States: blast at a Houston plant');
    expect(g?.precision).toBe('city');
  });

  it('prefers the longer name: Gulf of Mexico over Mexico', () => {
    const g = geocodeDetailed('Spill spreads across the Gulf of Mexico');
    expect(g?.precision).toBe('region');
    expect(g?.coord).toEqual([-90.0, 25.0]);
  });

  it('does not let Mexico shadow New Mexico', () => {
    const g = geocodeDetailed('Well blowout in New Mexico');
    expect(g?.precision).toBe('region');
    expect(g?.coord).toEqual([-106.1, 34.4]);
  });

  it('falls back to a country centroid', () => {
    const g = geocodeDetailed('Pipeline sabotage in Nigeria');
    expect(g?.precision).toBe('country');
  });

  it('returns null when no place is recognized', () => {
    expect(geocodeDetailed('Quarterly earnings beat expectations')).toBeNull();
  });
});

describe('precisionJitter', () => {
  it('is deterministic for a seed', () => {
    expect(precisionJitter('abc', 'city')).toEqual(precisionJitter('abc', 'city'));
  });

  it('spreads city placements less than country placements', () => {
    const [cx, cy] = precisionJitter('seed-xyz', 'city');
    const [nx, ny] = precisionJitter('seed-xyz', 'country');
    // Same seed → same normalized offset, scaled by the tier amplitude.
    expect(Math.abs(cx)).toBeLessThanOrEqual(0.15);
    expect(Math.abs(cy)).toBeLessThanOrEqual(0.15);
    expect(Math.abs(nx)).toBeGreaterThan(Math.abs(cx));
    expect(Math.abs(ny)).toBeGreaterThan(Math.abs(cy));
  });
});
