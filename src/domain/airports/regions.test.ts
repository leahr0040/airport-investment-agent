import { describe, expect, it } from 'vitest';
import { lookupAirports } from './regions';

describe('lookupAirports', () => {
  it('expands a known region name to its airports', () => {
    expect(lookupAirports('New England')).toEqual(['BOS', 'BDL', 'PWM']);
    expect(lookupAirports('new england')).toEqual(['BOS', 'BDL', 'PWM']);
  });

  it('expands a known metro name to its airports', () => {
    expect(lookupAirports('LA')).toEqual(['LAX', 'BUR', 'LGB', 'SNA', 'ONT']);
    expect(lookupAirports('Bay Area')).toEqual(['SFO', 'OAK', 'SJC']);
  });

  it('resolves the legacy PBI alias to DJT', () => {
    expect(lookupAirports('PBI')).toEqual(['DJT']);
  });

  it('passes an unrecognised code through uppercased', () => {
    expect(lookupAirports('atl')).toEqual(['ATL']);
    expect(lookupAirports('  katl  ')).toEqual(['KATL']);
  });
});
