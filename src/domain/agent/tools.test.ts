import { describe, expect, it, vi } from 'vitest';

vi.mock('@/domain/scoring/buildScoringInputs', () => ({ buildScoringInputs: vi.fn() }));

import { resolveRegion, scoreAirportsTool } from './tools';
import { buildScoringInputs } from '@/domain/scoring/buildScoringInputs';

describe('resolveRegion', () => {
  it('resolves a known region key to its ICAO codes', async () => {
    const result = await resolveRegion({ region: 'new england' });
    expect(result.icaos).toEqual(['KBOS', 'KBDL', 'KPWM']);
  });
});

describe('scoreAirportsTool', () => {
  it('delegates to buildScoringInputs and scores the result', async () => {
    vi.mocked(buildScoringInputs).mockResolvedValue([]);

    const result = await scoreAirportsTool({ icaos: ['KATL'] });

    expect(buildScoringInputs).toHaveBeenCalledWith(['KATL']);
    expect(result.scores).toEqual([]);
  });
});
