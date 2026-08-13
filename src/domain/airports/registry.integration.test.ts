/**
 * Live proof against the real FAA ArcGIS layers — no credential required
 * (both layers are keyless). Confirms the filter, join, geometry, and
 * indexes are correct against production data, not just a synthetic fixture.
 */

import { describe, expect, it } from 'vitest';
import { buildRegistry } from './registry';
import { resolve } from './resolve';
import { STATE_TO_REGION } from './regions';

describe('registry.integration (live FAA ArcGIS)', () => {
  it('builds a registry of roughly 500 Part 139 commercial-service airports with correct ICAO/IATA keys, territory exclusion, and runway geometry', async () => {
    const registry = await buildRegistry();

    // Registry size: the unguarded filter would return ~5,167; the corrected
    // filter plus territory exclusion should land between 480 and 560.
    expect(registry.all.length).toBeGreaterThanOrEqual(480);
    expect(registry.all.length).toBeLessThanOrEqual(560);

    // RESOLVE-02: Alaska/Hawaii carry native ICAO codes, never a synthesised K-prefix.
    expect(registry.byIcao.has('PANC')).toBe(true);
    expect(registry.byIcao.has('PHNL')).toBe(true);
    expect(registry.byIcao.has('KANC')).toBe(false);
    expect(registry.byIcao.has('KHNL')).toBe(false);

    // West Palm Beach's 2026 FAA rename: DJT is present, and the resolver still
    // answers to the legacy code PBI via the alias table.
    expect(registry.byIata.has('DJT')).toBe(true);
    const pbiResult = resolve('PBI', registry);
    expect(pbiResult.matches[0]?.iata).toBe('DJT');

    // Territory exclusion: every surviving airport's state is a key of
    // STATE_TO_REGION — no PR/VI/GU/AS/MP/QM record survives the build.
    for (const airport of registry.all) {
      expect(airport.state in STATE_TO_REGION).toBe(true);
    }

    // ATL: at least 5 runways and at least one ParallelGroup with a finite separation.
    const atl = registry.byIata.get('ATL');
    expect(atl).toBeDefined();
    expect(atl!.runways.length).toBeGreaterThanOrEqual(5);
    expect(atl!.parallelGroups.some((g) => typeof g.separationMeters === 'number' && Number.isFinite(g.separationMeters))).toBe(
      true,
    );

    // Every airport has runwayCount === runways.length and at least one runway.
    for (const airport of registry.all) {
      expect(airport.runwayCount).toBe(airport.runways.length);
      expect(airport.runways.length).toBeGreaterThan(0);
    }
  }, 60000);
});
