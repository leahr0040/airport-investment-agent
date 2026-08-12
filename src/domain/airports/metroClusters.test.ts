import { describe, expect, it } from 'vitest';
import { METRO_CLUSTERS, METRO_ALIASES } from './metroClusters';
import { LEGACY_CODE_ALIASES } from './aliases';
import { STATE_NAME_TO_CODE } from './regions';
import { makeTestRegistry } from './fixtures/testRegistry';

describe('metroClusters', () => {

  it('every METRO_ALIASES value is a real cluster id, and washington is not a key', () => {
    const ids = new Set(METRO_CLUSTERS.map((c) => c.id));
    for (const value of Object.values(METRO_ALIASES)) {
      expect(ids.has(value)).toBe(true);
    }
    expect(METRO_ALIASES.washington).toBeUndefined();
  });

  it('collides with a full state name only for the deliberately shadowed "new york"', () => {
    const collisions = Object.keys(METRO_ALIASES).filter((k) => k in STATE_NAME_TO_CODE);
    expect(collisions).toEqual(['new york']);
  });

  it('every cluster code exists in the registry, and South Florida carries DJT via the PBI alias', () => {
    const reg = makeTestRegistry();
    for (const cluster of METRO_CLUSTERS) {
      for (const code of cluster.codes) expect(reg.byIata.has(code)).toBe(true);
    }
    const southfl = METRO_CLUSTERS.find((c) => c.id === 'southfl');
    expect(southfl?.codes).toContain('DJT');
    expect(LEGACY_CODE_ALIASES.PBI).toBe('DJT');
  });
});
