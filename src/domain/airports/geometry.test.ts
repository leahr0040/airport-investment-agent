/**
 * Pure geometry coverage: bearing, local-metres projection, heading-delta
 * wraparound, and parallel-runway grouping. All coordinates are synthetic and
 * computed in-test so expected values are self-evident.
 */

import { describe, expect, it } from 'vitest';
import {
  bearingDeg,
  deriveParallelGroups,
  headingDeltaDeg,
  PARALLEL_HEADING_TOLERANCE_DEG,
  toLocalMeters,
} from './geometry';
import type { RunwaySummary } from './types';

const ORIGIN_LAT = 40;
const ORIGIN_LON = -90;

function makeRunway(
  id: string,
  end1: { lat: number; lon: number },
  end2: { lat: number; lon: number },
): RunwaySummary {
  return {
    id,
    lengthFt: 10000,
    widthFt: 150,
    surface: 'CONC',
    condition: 'G',
    headingDeg: bearingDeg(end1.lat, end1.lon, end2.lat, end2.lon) % 180,
    end1,
    end2,
  };
}

describe('bearingDeg', () => {
  it('returns approximately 0 for a segment running due north', () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 1);
  });

  it('returns approximately 90 for a segment running due east', () => {
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 1);
  });

  it('returns approximately 180 for a segment running due south', () => {
    expect(bearingDeg(0, 0, -1, 0)).toBeCloseTo(180, 1);
  });
});

describe('headingDeltaDeg', () => {
  it('wraps around the 0/180 boundary of the half-circle', () => {
    expect(headingDeltaDeg(5, 175)).toBeCloseTo(10, 5);
  });

  it('treats 179 and 1 degrees as 2 degrees apart, not 178', () => {
    expect(headingDeltaDeg(179, 1)).toBeCloseTo(2, 5);
  });
});

describe('toLocalMeters', () => {
  it('projects one degree of latitude north of the origin to roughly y=110540, x=0', () => {
    const { x, y } = toLocalMeters(ORIGIN_LAT + 1, ORIGIN_LON, ORIGIN_LAT, ORIGIN_LON);
    expect(y).toBeCloseTo(110_540, -2);
    expect(x).toBeCloseTo(0, 5);
  });
});

describe('deriveParallelGroups', () => {
  it('groups two synthetic east-west runways 1400 metres apart in latitude into one group within 10m of 1400', () => {
    const latOffset = 1400 / 110_540;
    const r1 = makeRunway('09/27', { lat: ORIGIN_LAT, lon: ORIGIN_LON }, { lat: ORIGIN_LAT, lon: ORIGIN_LON + 0.05 });
    const r2 = makeRunway(
      '09R/27L',
      { lat: ORIGIN_LAT + latOffset, lon: ORIGIN_LON },
      { lat: ORIGIN_LAT + latOffset, lon: ORIGIN_LON + 0.05 },
    );
    const groups = deriveParallelGroups([r1, r2], ORIGIN_LAT, ORIGIN_LON);

    expect(groups).toHaveLength(1);
    expect(groups[0].separationMeters).not.toBeNull();
    expect(Math.abs((groups[0].separationMeters as number) - 1400)).toBeLessThan(10);
  });

  it('gives a lone runway one group with separationMeters null', () => {
    const r1 = makeRunway('09/27', { lat: ORIGIN_LAT, lon: ORIGIN_LON }, { lat: ORIGIN_LAT, lon: ORIGIN_LON + 0.05 });
    const groups = deriveParallelGroups([r1], ORIGIN_LAT, ORIGIN_LON);

    expect(groups).toHaveLength(1);
    expect(groups[0].separationMeters).toBeNull();
  });

  it('forms two separate groups, each with separationMeters null, for runways at 0 and 90 degrees', () => {
    const northSouth = makeRunway(
      '18/36',
      { lat: ORIGIN_LAT, lon: ORIGIN_LON },
      { lat: ORIGIN_LAT + 0.02, lon: ORIGIN_LON },
    );
    const eastWest = makeRunway(
      '09/27',
      { lat: ORIGIN_LAT, lon: ORIGIN_LON },
      { lat: ORIGIN_LAT, lon: ORIGIN_LON + 0.05 },
    );
    const groups = deriveParallelGroups([northSouth, eastWest], ORIGIN_LAT, ORIGIN_LON);

    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.separationMeters === null)).toBe(true);
  });

  it('reports the closest pair (800m), not the widest, for three parallel runways at 0/800/2000m offsets', () => {
    const off0 = makeRunway('09L/27R', { lat: ORIGIN_LAT, lon: ORIGIN_LON }, { lat: ORIGIN_LAT, lon: ORIGIN_LON + 0.05 });
    const lat800 = ORIGIN_LAT + 800 / 110_540;
    const off800 = makeRunway(
      '09C/27C',
      { lat: lat800, lon: ORIGIN_LON },
      { lat: lat800, lon: ORIGIN_LON + 0.05 },
    );
    const lat2000 = ORIGIN_LAT + 2000 / 110_540;
    const off2000 = makeRunway(
      '09R/27L',
      { lat: lat2000, lon: ORIGIN_LON },
      { lat: lat2000, lon: ORIGIN_LON + 0.05 },
    );
    const groups = deriveParallelGroups([off0, off800, off2000], ORIGIN_LAT, ORIGIN_LON);

    expect(groups).toHaveLength(1);
    expect(Math.abs((groups[0].separationMeters as number) - 800)).toBeLessThan(10);
  });
});

describe('PARALLEL_HEADING_TOLERANCE_DEG', () => {
  it('equals 15', () => {
    expect(PARALLEL_HEADING_TOLERANCE_DEG).toBe(15);
  });
});
