import { fetchMovements } from '@/domain/adapters/opensky';
import { fetchFaaFacility } from '@/domain/adapters/faaFacility';
import { fetchNasStatus } from '@/domain/adapters/nasStatus';
import type { ScoringInput } from './expansionScore';


export async function buildScoringInputs(icaos: string[]): Promise<ScoringInput[]> {
  const unique = Array.from(new Set(icaos.map((code) => code.trim().toUpperCase())));

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
