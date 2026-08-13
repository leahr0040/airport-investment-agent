import { describe, expect, it } from 'vitest';
import {
  AIRPORT_CODE_PATTERN,
  UnknownAirportError,
  isAllowedAirportCode,
  assertAllowedAirport,
  airportCodeSchema,
} from './allowlist';
import { makeTestRegistry } from './fixtures/testRegistry';

const reg = makeTestRegistry();

describe('AIRPORT_CODE_PATTERN', () => {
  it('matches 3 or 4 uppercase-alphanumeric characters only', () => {
    expect(AIRPORT_CODE_PATTERN.test('ATL')).toBe(true);
    expect(AIRPORT_CODE_PATTERN.test('KATL')).toBe(true);
    expect(AIRPORT_CODE_PATTERN.test('AT')).toBe(false);
    expect(AIRPORT_CODE_PATTERN.test('KATLX')).toBe(false);
    expect(AIRPORT_CODE_PATTERN.test('atl')).toBe(false);
    expect(AIRPORT_CODE_PATTERN.test('AT-L')).toBe(false);
  });
});

describe('assertAllowedAirport — allowed', () => {
  it('returns the AirportRef for a valid ICAO code', () => {
    const airport = assertAllowedAirport('KATL', reg);
    expect(airport.iata).toBe('ATL');
  });

  it('is case-insensitive', () => {
    const airport = assertAllowedAirport('katl', reg);
    expect(airport.iata).toBe('ATL');
  });

  it('resolves the legacy PBI alias to DJT', () => {
    const airport = assertAllowedAirport('PBI', reg);
    expect(airport.iata).toBe('DJT');
  });
});

describe('assertAllowedAirport — rejected', () => {
  it('throws UnknownAirportError for an identifier absent from the registry, naming it', () => {
    expect(() => assertAllowedAirport('ZZZZ', reg)).toThrow(UnknownAirportError);
    try {
      assertAllowedAirport('ZZZZ', reg);
      throw new Error('expected assertAllowedAirport to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownAirportError);
      expect((err as UnknownAirportError).message).toContain('ZZZZ');
    }
  });

  const malformedCases: Record<string, string> = {
    'URL-shaped': 'http://evil.example.com',
    'path-traversal-shaped': '../../etc/passwd',
    'CRLF-bearing': 'ATL\r\nX-Injected: 1',
    'hyphen-separated': 'AT-L',
    'whitespace-bearing': 'A T L',
  };

  for (const [label, input] of Object.entries(malformedCases)) {
    it(`throws UnknownAirportError for ${label} input without echoing it`, () => {
      let thrown: UnknownAirportError | undefined;
      try {
        assertAllowedAirport(input, reg);
      } catch (err) {
        thrown = err as UnknownAirportError;
      }
      expect(thrown).toBeInstanceOf(UnknownAirportError);
      expect(thrown!.message).not.toContain(input);
      expect(thrown!.code).not.toContain(input);
    });
  }
});

describe('isAllowedAirportCode', () => {
  it('returns true for known codes', () => {
    expect(isAllowedAirportCode('KATL', reg)).toBe(true);
    expect(isAllowedAirportCode('ATL', reg)).toBe(true);
    expect(isAllowedAirportCode('PANC', reg)).toBe(true);
    expect(isAllowedAirportCode('PBI', reg)).toBe(true);
  });

  it('returns false for every rejected case', () => {
    expect(isAllowedAirportCode('ZZZZ', reg)).toBe(false);
    expect(isAllowedAirportCode('http://evil.example.com', reg)).toBe(false);
    expect(isAllowedAirportCode('../../etc/passwd', reg)).toBe(false);
    expect(isAllowedAirportCode('ATL\r\nX-Injected: 1', reg)).toBe(false);
    expect(isAllowedAirportCode('AT-L', reg)).toBe(false);
    expect(isAllowedAirportCode('A T L', reg)).toBe(false);
  });
});

describe('airportCodeSchema', () => {
  it('trims and uppercases then resolves to the AirportRef', () => {
    const schema = airportCodeSchema(reg);
    const parsed = schema.parse('  katl  ');
    expect(parsed.iata).toBe('ATL');
  });

  it('rejects malformed input', () => {
    const schema = airportCodeSchema(reg);
    expect(() => schema.parse('../../etc/passwd')).toThrow();
  });
});
