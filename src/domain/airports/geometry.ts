/**
 * Runway heading and parallel-group separation geometry. Pure functions only,
 * no I/O — the registry build (registry.ts) is the sole caller.
 */

import type { ParallelGroup, RunwaySummary } from './types';

const toRad = (d: number) => (d * Math.PI) / 180;

/** Standard initial-bearing formula over two endpoints, normalised into 0-360. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Equirectangular projection, not geodesic: at runway-separation scale (hundreds of
// metres to ~2km) the two agree to within centimetres, and the failure mode worth
// avoiding is treating raw degrees as a distance, not choosing the wrong projection.
export function toLocalMeters(
  lat: number,
  lon: number,
  lat0: number,
  lon0: number,
): { x: number; y: number } {
  const x = (lon - lon0) * Math.cos(toRad(lat0)) * 111_320;
  const y = (lat - lat0) * 110_540;
  return { x, y };
}

/** Smallest angular difference between two headings on the 0-to-180 half-circle. */
export function headingDeltaDeg(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 180 - diff);
}

// A judgement call (RESEARCH.md assumption A3): wide enough to catch Atlanta's
// offset fifth runway, which the L/C/R naming convention alone would miss. Raw
// separationMeters is surfaced rather than reduced to a boolean so a later phase
// can state the number, not a verdict.
export const PARALLEL_HEADING_TOLERANCE_DEG = 15;

export function deriveParallelGroups(
  runways: RunwaySummary[],
  lat0: number,
  lon0: number,
): ParallelGroup[] {
  const withMidpoint = runways.map((runway) => {
    const midLat = (runway.end1.lat + runway.end2.lat) / 2;
    const midLon = (runway.end1.lon + runway.end2.lon) / 2;
    return { runway, mid: toLocalMeters(midLat, midLon, lat0, lon0) };
  });

  const groups: (typeof withMidpoint)[] = [];
  for (const entry of withMidpoint) {
    const group = groups.find(
      (g) => headingDeltaDeg(g[0].runway.headingDeg, entry.runway.headingDeg) <= PARALLEL_HEADING_TOLERANCE_DEG,
    );
    if (group) group.push(entry);
    else groups.push([entry]);
  }

  return groups.map((group) => {
    const headingDeg = group[0].runway.headingDeg;
    const runwayIds = group.map((g) => g.runway.id).sort();

    if (group.length < 2) {
      return { headingDeg, runwayIds, separationMeters: null };
    }

    const thetaRad = toRad(headingDeg);
    const nx = Math.cos(thetaRad);
    const ny = -Math.sin(thetaRad);

    // The closest pair, not the widest — the closest-spaced pair is what determines
    // whether simultaneous independent instrument approaches are possible, the
    // capacity signal DATA-01 exists to feed.
    let closest: number | null = null;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const dx = group[j].mid.x - group[i].mid.x;
        const dy = group[j].mid.y - group[i].mid.y;
        const separation = Math.abs(dx * nx + dy * ny);
        if (separation > 0 && (closest === null || separation < closest)) {
          closest = separation;
        }
      }
    }

    return { headingDeg, runwayIds, separationMeters: closest };
  });
}
