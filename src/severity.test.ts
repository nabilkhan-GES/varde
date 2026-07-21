import { describe, expect, it } from 'vitest';
import { scoreMagnitude, scoreText, severityColor, severityRadius } from './severity';

describe('scoreText', () => {
  it('scores a routine mention near the floor', () => {
    expect(scoreText('pipeline maintenance permit filed')).toBeLessThan(2);
  });

  it('compounds multipliers for a severe event', () => {
    const s = scoreText('Offshore rig blowout sparks fire, two killed');
    expect(s).toBeGreaterThan(6);
  });

  it('ranks a fatal blowout above a simple leak', () => {
    expect(scoreText('worker killed in blowout')).toBeGreaterThan(scoreText('minor gas leak reported'));
  });

  it('caps the score', () => {
    expect(scoreText('offshore blowout explosion fire fatalities spill evacuation refinery')).toBeLessThanOrEqual(12);
  });
});

describe('scoreMagnitude', () => {
  it('maps magnitude bands onto the severity scale', () => {
    expect(scoreMagnitude(6.2)).toBeGreaterThan(scoreMagnitude(4.5));
    expect(scoreMagnitude(2.6)).toBeGreaterThanOrEqual(1);
  });
});

describe('visual encoding', () => {
  it('reddens as severity rises', () => {
    expect(severityColor(7)[0]).toBeGreaterThan(severityColor(1)[0]);
  });
  it('grows radius monotonically with severity', () => {
    expect(severityRadius(9)).toBeGreaterThan(severityRadius(1));
  });
});
