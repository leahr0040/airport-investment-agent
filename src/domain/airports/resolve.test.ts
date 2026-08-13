import { describe, expect, it } from 'vitest';
import { resolve, normalizeQuery } from './resolve';
import { makeTestRegistry } from './fixtures/testRegistry';

const reg = makeTestRegistry();

function iatas(result: ReturnType<typeof resolve>): string[] {
  return result.matches.map((a) => a.iata);
}

describe('normalizeQuery', () => {
  it('collapses whitespace and lowercases text', () => {
    expect(normalizeQuery('  New   England  ').text).toBe('new england');
  });

  it('strips punctuation for the aggressive code form', () => {
    expect(normalizeQuery('l.a.').code).toBe('LA');
    expect(normalizeQuery('k-a-t-l').code).toBe('KATL');
  });
});

describe('resolve — code matching', () => {
  it('resolves ICAO codes', () => {
    const r = resolve('KATL', reg);
    expect(r.kind).toBe('icao');
    expect(iatas(r)).toEqual(['ATL']);
    expect(r.ambiguous).toBe(false);
  });

  it('resolves IATA codes case-insensitively and trims whitespace', () => {
    expect(iatas(resolve('atl', reg))).toEqual(['ATL']);
    expect(resolve('atl', reg).kind).toBe('iata');
    expect(iatas(resolve('  ATL  ', reg))).toEqual(['ATL']);
    expect(resolve('  ATL  ', reg).kind).toBe('iata');
  });

  it('resolves Alaska and Hawaii by their native ICAO codes', () => {
    expect(iatas(resolve('PANC', reg))).toEqual(['ANC']);
    expect(resolve('PANC', reg).kind).toBe('icao');
    expect(iatas(resolve('PHNL', reg))).toEqual(['HNL']);
    expect(resolve('PHNL', reg).kind).toBe('icao');
  });

  it('does not synthesise a K-prefixed ICAO for Alaska/Hawaii (RESOLVE-02)', () => {
    const anc = resolve('KANC', reg);
    expect(anc.kind).toBe('none');
    expect(anc.matches).toHaveLength(0);
    const hnl = resolve('KHNL', reg);
    expect(hnl.kind).toBe('none');
    expect(hnl.matches).toHaveLength(0);
  });
});

describe('resolve — legacy alias', () => {
  it('resolves PBI to DJT and names both in matchedVia', () => {
    const r = resolve('PBI', reg);
    expect(r.kind).toBe('alias');
    expect(iatas(r)).toEqual(['DJT']);
    expect(r.matchedVia).not.toBeNull();
    expect(r.matchedVia).toContain('PBI');
    expect(r.matchedVia).toContain('DJT');
  });
});

describe('resolve — metro clusters', () => {
  it('resolves LA to the ambiguous metro cluster, not the state of Louisiana', () => {
    const r = resolve('LA', reg);
    expect(r.kind).toBe('metro');
    expect(r.ambiguous).toBe(true);
    expect(iatas(r)).toEqual(['BUR', 'LAX', 'LGB', 'ONT', 'SNA']);
    expect(r.matchedVia).toContain('Louisiana');
  });

  it('resolves Louisiana to the state, not the LA metro cluster', () => {
    const r = resolve('Louisiana', reg);
    expect(r.kind).toBe('state');
  });

  it('resolves Washington DC to the metro cluster', () => {
    const r = resolve('Washington DC', reg);
    expect(r.kind).toBe('metro');
    expect(iatas(r)).toEqual(['BWI', 'DCA', 'IAD']);
  });
});

describe('resolve — region and state', () => {
  it('resolves New England to its region set', () => {
    const r1 = resolve('New England', reg);
    expect(r1.kind).toBe('region');
    expect(iatas(r1)).toEqual(['BDL', 'BOS', 'PWM']);
    expect(r1.ambiguous).toBe(false);

    const r2 = resolve('new england', reg);
    expect(r2.kind).toBe('region');
    expect(iatas(r2)).toEqual(['BDL', 'BOS', 'PWM']);
  });

  it('resolves Texas by name and by 2-letter code', () => {
    const byName = resolve('Texas', reg);
    expect(byName.kind).toBe('state');
    expect(iatas(byName)).toEqual(['AUS', 'DFW', 'IAH']);

    const byCode = resolve('TX', reg);
    expect(byCode.kind).toBe('state');
    expect(iatas(byCode)).toEqual(['AUS', 'DFW', 'IAH']);
  });

  it('resolves bare Washington to the state, not the DC metro cluster', () => {
    const r = resolve('Washington', reg);
    expect(r.kind).toBe('state');
    expect(iatas(r)).toContain('SEA');
  });
});

describe('resolve — name/city substring matching', () => {
  it('resolves Santa Ana to SNA by city', () => {
    const r = resolve('Santa Ana', reg);
    expect(r.kind).toBe('name');
    expect(iatas(r)).toEqual(['SNA']);
  });

  it('resolves Portland ambiguously to PDX and PWM', () => {
    const r = resolve('Portland', reg);
    expect(r.kind).toBe('name');
    expect(r.ambiguous).toBe(true);
    expect(iatas(r)).toEqual(['PDX', 'PWM']);
  });

  it('resolves Anchorage to a single airport', () => {
    const r = resolve('Anchorage', reg);
    expect(r.kind).toBe('name');
    expect(iatas(r)).toEqual(['ANC']);
  });
});

describe('resolve — misses (D-07)', () => {
  it('returns kind none with suggestions rather than throwing for an unknown code', () => {
    const r = resolve('ZZZZ', reg);
    expect(r.kind).toBe('none');
    expect(r.matches).toHaveLength(0);
  });

  it('never throws for the empty string', () => {
    const r = resolve('', reg);
    expect(r.kind).toBe('none');
    expect(r.matches).toHaveLength(0);
  });

  it('never throws for a long junk string or punctuation-only input', () => {
    expect(() => resolve('x'.repeat(200), reg)).not.toThrow();
    expect(() => resolve('!!!???...', reg)).not.toThrow();
  });
});

describe('resolve — determinism', () => {
  it('always returns matches sorted by iata ascending', () => {
    const queries = ['LA', 'New England', 'Portland', 'Texas', 'Washington DC'];
    for (const q of queries) {
      const r = resolve(q, reg);
      const iataList = iatas(r);
      const sorted = [...iataList].sort((a, b) => a.localeCompare(b));
      expect(iataList).toEqual(sorted);
    }
  });
});
