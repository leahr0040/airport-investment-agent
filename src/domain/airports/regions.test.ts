import { describe, expect, it } from 'vitest';
import { lookupAirports, regionKeys } from './regions';

describe('lookupAirports', () => {
  it('expands a known region name to its airports (object pairs)', () => {
    expect(lookupAirports('New England')).toEqual([
      { iata: 'BOS', icao: 'KBOS' },
      { iata: 'BDL', icao: 'KBDL' },
      { iata: 'PWM', icao: 'KPWM' },
    ]);

    expect(lookupAirports('new england')).toEqual([
      { iata: 'BOS', icao: 'KBOS' },
      { iata: 'BDL', icao: 'KBDL' },
      { iata: 'PWM', icao: 'KPWM' },
    ]);
  });

  it('expands known metros to airport pairs', () => {
    expect(lookupAirports('LA')).toEqual([
      { iata: 'LAX', icao: 'KLAX' },
      { iata: 'BUR', icao: 'KBUR' },
      { iata: 'LGB', icao: 'KLGB' },
      { iata: 'SNA', icao: 'KSNA' },
      { iata: 'ONT', icao: 'KONT' },
    ]);

    expect(lookupAirports('Bay Area')).toEqual([
      { iata: 'SFO', icao: 'KSFO' },
      { iata: 'OAK', icao: 'KOAK' },
      { iata: 'SJC', icao: 'KSJC' },
    ]);
  });

  it('resolves Alaska and Hawaii from the table, not the K-prefix rule', () => {
    expect(lookupAirports('Alaska')).toEqual([{ iata: 'ANC', icao: 'PANC' }]);
    expect(lookupAirports('Hawaii')).toEqual([{ iata: 'HNL', icao: 'PHNL' }]);
  });

  it('returns passthrough pairs for unrecognised codes and preserves K-prefix for 3-letter codes', () => {
    expect(lookupAirports('atl')).toEqual([{ iata: 'ATL', icao: 'KATL' }]);
    expect(lookupAirports('  ord  ')).toEqual([{ iata: 'ORD', icao: 'KORD' }]);
    expect(lookupAirports('anc')).toEqual([{ iata: 'ANC', icao: 'PANC' }]);
    expect(lookupAirports('hnl')).toEqual([{ iata: 'HNL', icao: 'PHNL' }]);
    expect(lookupAirports('katl')).toEqual([{ iata: 'ATL', icao: 'KATL' }]);
    expect(lookupAirports('PBI')).toEqual([{ iata: 'PBI', icao: 'KPBI' }]);
  });

  it('carries a well-formed {iata, icao} pair on every table entry', () => {
    for (const key of regionKeys()) {
      for (const pair of lookupAirports(key)) {
        expect(pair.icao).toMatch(/^[A-Z]{4}$/);
        expect(pair.iata).toMatch(/^[A-Z]{3}$/);
      }
    }
  });

  it('fails closed on empty, whitespace-only, malformed, or wrong-length input', () => {
    expect(lookupAirports('')).toEqual([]);
    expect(lookupAirports('   ')).toEqual([]);
    expect(lookupAirports('K$T!')).toEqual([]);
    expect(lookupAirports('AB')).toEqual([]);
    expect(lookupAirports('ABCDE')).toEqual([]);
  });
});
