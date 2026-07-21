// Severity scoring for energy incidents. Keyword multipliers compound so that,
// say, an "offshore blowout fire" scores far above a routine "pipeline permit".
// Shared by the server (to score + sort) and the client (to color + size).

const RULES: Array<[RegExp, number]> = [
  [/blowout|well control|kick\b|loss of control/i, 3],
  [/fatal|killed|dead|death|casualt|missing/i, 3],
  [/explos|blast|detonat|rupture/i, 2.5],
  [/spill|leak|release|discharge/i, 1.7],
  [/fire|blaze|burn|flare|ignit/i, 1.6],
  [/offshore|rig|platform|subsea|jack-?up|drillship/i, 1.5],
  [/evacuat|shelter[- ]in[- ]place|mass casualt/i, 1.5],
  [/refinery|refining|terminal|LNG|processing plant/i, 1.3],
  [/shutdown|outage|force majeure|shut in/i, 1.2],
  [/pipeline|wellhead|storage/i, 1.15],
];

const CAP = 12;

export function scoreText(text: string): number {
  let s = 1;
  for (const [re, mult] of RULES) if (re.test(text)) s *= mult;
  return Math.min(Math.round(s * 100) / 100, CAP);
}

/** Map an earthquake magnitude to the same 1..CAP severity scale. */
export function scoreMagnitude(mag: number): number {
  if (mag >= 6) return 6;
  if (mag >= 5) return 3.5;
  if (mag >= 4) return 2.2;
  if (mag >= 3) return 1.5;
  return 1.1;
}

/** RGB ramp: grey → amber → orange → red as severity climbs. */
export function severityColor(s: number): [number, number, number] {
  if (s >= 6) return [239, 68, 68];
  if (s >= 3) return [249, 115, 22];
  if (s >= 1.6) return [234, 179, 8];
  return [148, 163, 184];
}

/** Marker radius in pixels, gently compressed so extremes stay readable. */
export function severityRadius(s: number): number {
  return 5 + Math.sqrt(s) * 4.2;
}
