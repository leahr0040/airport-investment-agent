import { fetchMovements } from '@/domain/adapters/opensky';
import { fetchFaaFacility } from '@/domain/adapters/faaFacility';
import { fetchNasStatus } from '@/domain/adapters/nasStatus';
import type { ScoringInput } from './expansionScore';

// Caps parallel per-request fan-out (3 upstream calls per airport) so one query can't
// exhaust OpenSky's daily credit quota.
const MAX_AIRPORTS_PER_QUERY = 6;

export async function buildScoringInputs(icaos: string[]): Promise<ScoringInput[]> {
  const unique = Array.from(new Set(icaos.map((code) => code.trim().toUpperCase()))).slice(0, MAX_AIRPORTS_PER_QUERY);

  return Promise.all(
    unique.map(async (icao) => {
      const [movements, facility, nasStatus] = await Promise.all([
        fetchMovements(icao),
        fetchFaaFacility(icao),
        fetchNasStatus(icao),
      ]);
      return { icao, movements, facility, nasStatus };
    }),
  );
}
