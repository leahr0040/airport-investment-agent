import { describe, expect, it } from 'vitest';
import {
  STATE_TO_REGION,
  STATE_NAME_TO_CODE,
  REGION_ALIASES,
  regionForState,
  airportsInRegion,
  airportsInState,
} from './regions';
import { makeTestRegistry } from './fixtures/testRegistry';

describe('regions', () => {
  it('STATE_TO_REGION has 51 entries across 9 regions, DC/AK/HI/TX placed correctly', () => {
    expect(Object.keys(STATE_TO_REGION)).toHaveLength(51);
    expect(new Set(Object.values(STATE_TO_REGION)).size).toBe(9);
    expect(STATE_TO_REGION.DC).toBe('Mid-Atlantic');
    expect(STATE_TO_REGION.AK).toBe('Alaska');
    expect(STATE_TO_REGION.HI).toBe('Hawaii');
    expect(STATE_TO_REGION.TX).toBe('Southwest');
  });

  it('STATE_NAME_TO_CODE has 51 entries, includes DC, keeps bare washington as WA', () => {
    expect(Object.keys(STATE_NAME_TO_CODE)).toHaveLength(51);
    expect(STATE_NAME_TO_CODE['district of columbia']).toBe('DC');
    expect(STATE_NAME_TO_CODE.washington).toBe('WA');
    expect(STATE_NAME_TO_CODE.texas).toBe('TX');
  });

  it('REGION_ALIASES maps common spelling variants', () => {
    expect(REGION_ALIASES['west coast']).toBe('Pacific');
    expect(REGION_ALIASES['new england']).toBe('New England');
  });

  it('regionForState is case-insensitive and undefined for territories/junk', () => {
    expect(regionForState('tx')).toBe('Southwest');
    expect(regionForState('PR')).toBeUndefined();
    expect(regionForState('GU')).toBeUndefined();
    expect(regionForState('')).toBeUndefined();
  });

  it('airportsInRegion returns New England airports sorted by iata', () => {
    const reg = makeTestRegistry();
    expect(airportsInRegion('New England', reg).map((a) => a.iata)).toEqual([
      'BDL',
      'BOS',
      'PWM',
    ]);
  });

  it('airportsInState returns only Texas airports sorted by iata', () => {
    const reg = makeTestRegistry();
    expect(airportsInState('TX', reg).map((a) => a.iata)).toEqual(['AUS', 'DFW', 'IAH']);
  });

  it('makeTestRegistry maps are mutually consistent and cover PANC/PHNL/DJT', () => {
    const reg = makeTestRegistry();
    for (const airport of reg.all) {
      expect(reg.byIcao.get(airport.icao)).toBe(airport);
      expect(reg.byIata.get(airport.iata)).toBe(airport);
      expect(reg.byState.get(airport.state)).toContain(airport);
    }
    expect(reg.byIcao.get('PANC')?.iata).toBe('ANC');
    expect(reg.byIcao.get('PHNL')?.iata).toBe('HNL');
    expect(reg.byIata.get('DJT')?.icao).toBe('KDJT');
  });
});
