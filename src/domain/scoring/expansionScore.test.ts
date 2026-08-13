import { describe, it, expect } from 'vitest';
import type { Movements } from '../adapters/opensky.types';
import type { FaaFacility } from '../adapters/faaFacility';
import type { NasStatus } from '../adapters/nasStatus';
import type { AdapterResult } from '../adapters/types';

import {
  scoreAirports,
  CARGO_CALLSIGN_PREFIXES,
  computeVolumeKpi,
} from './expansionScore';

function movementsWithCallsigns(callsigns: (string | null)[]): Movements {
  // split the provided callsigns into departures (first half) and arrivals (second half)
  const half = Math.floor(callsigns.length / 2);
  const depCalls = callsigns.slice(0, half);
  const arrCalls = callsigns.slice(half);

  const make = (cs: (string | null)[]) =>
    cs.map((c, i) => ({
      icao24: `icao${i}`,
      callsign: c,
      firstSeen: 0,
      lastSeen: 0,
      estDepartureAirport: null,
      estArrivalAirport: null,
      departureAirportCandidatesCount: null,
      arrivalAirportCandidatesCount: null,
    }));

  const departures = make(depCalls);
  const arrivals = make(arrCalls);
  return {
    icao: 'KXXX',
    window: { begin: 0, end: 0, beginIso: '', endIso: '' },
    departures,
    arrivals,
    departureCount: departures.length,
    arrivalCount: arrivals.length,
    unknownDestinationCount: 0,
    unknownOriginCount: 0,
  };
}

function facilityWithRunways(count: number): FaaFacility {
  return {
    icao: 'KXXX',
    faaLid: 'XXX',
    name: 'Test',
    lat: null,
    lon: null,
    facilityUseCode: null,
    far139TypeCode: null,
    runways: Array.from({ length: count }).map((_, i) => ({
      runwayId: `RW${i}`,
      lengthFt: null,
      widthFt: null,
      end1: null,
      end2: null,
    })),
  };
}

function nasStatusWithEvents(count: number): NasStatus {
  return { lid: 'XXX', icao: 'KXXX', updateTime: null, events: Array.from({ length: count }).map(() => ({ type: 'Delay', reason: null, start: null, reopen: null, raw: {} })) };
}

function ok<T>(data: T, source = 'test'): AdapterResult<T> {
  return { ok: true, data, fetchedAt: '2026-01-01T00:00:00.000Z', source };
}

function fail<T>(reason: string): AdapterResult<T> {
  return { ok: false, reason: reason as any };
}

describe('expansionScore (phase plan)', () => {
  it('case group 1: three-airport comparison with cargo separation', () => {
    // callsign prefixes: passenger UAL/SWA, cargo FDX/UPS/GTI
    const SMALL = {
      icao: 'SMALL',
      movements: ok(movementsWithCallsigns([ ...Array(5).fill('UAL1'), ...Array(5).fill('SWA1') ])),
      facility: ok(facilityWithRunways(2)),
      nasStatus: ok(nasStatusWithEvents(0)),
    };

    const BUSY = {
      icao: 'BUSY',
      movements: ok(movementsWithCallsigns([ ...Array(50).fill('UAL2'), ...Array(50).fill('SWA2') ])),
      facility: ok(facilityWithRunways(4)),
      nasStatus: ok(nasStatusWithEvents(1)),
    };

    const ANC = {
      icao: 'ANC',
      movements: ok(movementsWithCallsigns([ ...Array(8).fill('FDX1'), ...Array(2).fill('UAL3'), ...Array(8).fill('FDX2'), ...Array(2).fill('SWA3') ])),
      facility: ok(facilityWithRunways(3)),
      nasStatus: ok(nasStatusWithEvents(0)),
    };

    const results = scoreAirports([SMALL, BUSY, ANC]);

    const anc = results.find((r) => r.icao === 'ANC')!;
    expect(anc.components.volume.kpi!.cargoMovements).toBe(16);
    expect(anc.components.volume.kpi!.passengerMovements).toBe(4);
    expect(anc.components.headroom.kpi!.totalMovements).toBe(20);

    // normalized volume across [10,100,4]
    const volVals = results.map((r) => r.components.volume.available ? r.components.volume.normalized! : null).filter((v) => v !== null) as number[];
    const ancVol = anc.components.volume.normalized!;
    const small = results.find((r) => r.icao === 'SMALL')!;
    const busy = results.find((r) => r.icao === 'BUSY')!;

    expect(busy.components.volume.normalized).toBeCloseTo(100, 4);
    expect(ancVol).toBeCloseTo(0, 4);
    expect(small.components.volume.normalized).toBeCloseTo(6.25, 4);

    // headroom normalized: movements-per-runway [5,25,6.6667]
    expect(small.components.headroom.normalized).toBeCloseTo(0, 4);
    expect(busy.components.headroom.normalized).toBeCloseTo(100, 4);
    expect(anc.components.headroom.normalized).toBeCloseTo(8.3333, 4);

    // delay normalized [0,1,0]
    expect(small.components.delayFrequency.normalized).toBeCloseTo(0, 4);
    expect(busy.components.delayFrequency.normalized).toBeCloseTo(100, 4);
    expect(anc.components.delayFrequency.normalized).toBeCloseTo(0, 4);

    // final scores
    expect(small.score).toBeCloseTo(2.0833, 3);
    expect(busy.score).toBeCloseTo(100, 3);
    expect(anc.score).toBeCloseTo(2.7778, 3);

    // weight per component
    results.forEach((r) => {
      expect(r.components.weightPerComponent).toBeCloseTo(1 / 3, 6);
      expect(r.components.coverage).toBe('3 of 3 components available');
    });

    // BUSY contributions sum to parent score
    const busyComps = busy.components;
    const sumContrib = busyComps.volume.contribution! + busyComps.headroom.contribution! + busyComps.delayFrequency.contribution!;
    expect(sumContrib).toBeCloseTo(busy.score, 3);
  });

  it('case group 2: weight redistribution when delay unavailable', () => {
    const P = {
      icao: 'P',
      movements: ok(movementsWithCallsigns([ ...Array(30).fill('UAL1') ])),
      facility: ok(facilityWithRunways(1)),
      nasStatus: fail('timeout') as any,
    };

    const Q = {
      icao: 'Q',
      movements: ok(movementsWithCallsigns([ ...Array(90).fill('UAL2') ])),
      facility: ok(facilityWithRunways(1)),
      nasStatus: fail('timeout') as any,
    };

    const results = scoreAirports([P, Q]);
    results.forEach((r) => {
      expect(r.components.delayFrequency.available).toBe(false);
      expect((r.components.delayFrequency as any).reason).toBe('timeout');
      expect(r.components.delayFrequency.normalized).toBeNull();
      expect(r.components.delayFrequency.contribution).toBeNull();
      expect(r.components.weightPerComponent).toBeCloseTo(0.5, 6);
      expect(r.components.coverage).toBe('2 of 3 components available');
    });

    const p = results.find((r) => r.icao === 'P')!;
    const q = results.find((r) => r.icao === 'Q')!;
    expect(p.score).toBeCloseTo(0, 6);
    expect(q.score).toBeCloseTo(100, 6);
  });

  it('case group 3: headroom requires both movements and facility', () => {
    const R = {
      icao: 'R',
      movements: ok(movementsWithCallsigns([ ...Array(40).fill('UALX') ])),
      facility: fail('no_data') as any,
      nasStatus: ok(nasStatusWithEvents(2)),
    };

    const S = {
      icao: 'S',
      movements: ok(movementsWithCallsigns([ ...Array(80).fill('UALY') ])),
      facility: ok(facilityWithRunways(2)),
      nasStatus: ok(nasStatusWithEvents(0)),
    };

    const results = scoreAirports([R, S]);
    const r = results.find((x) => x.icao === 'R')!;
    const s = results.find((x) => x.icao === 'S')!;

    expect(r.components.headroom.available).toBe(false);
    expect((r.components.headroom as any).reason).toBe('no_data');
    expect(r.components.volume.available).toBe(true);
    expect(r.components.weightPerComponent).toBeCloseTo(0.5, 6);
    expect(s.components.weightPerComponent).toBeCloseTo(1 / 3, 6);

    // headroom dataset contains only S -> min===max -> normalized 50 fallback
    expect(s.components.headroom.normalized).toBeCloseTo(50, 6);
  });

  it('case group 4: all three groups unavailable', () => {
    const Z = {
      icao: 'Z',
      movements: fail('timeout') as any,
      facility: fail('no_data') as any,
      nasStatus: fail('invalid_input') as any,
    };

    const results = scoreAirports([Z]);
    const z = results[0];
    expect(z.score).toBe(0);
    expect(z.components.weightPerComponent).toBe(0);
    expect(z.components.coverage).toBe('0 of 3 components available');
  });

  it('case group 5: determinism', () => {
    const SMALL = {
      icao: 'SMALL',
      movements: ok(movementsWithCallsigns([ ...Array(5).fill('UAL1'), ...Array(5).fill('SWA1') ])),
      facility: ok(facilityWithRunways(2)),
      nasStatus: ok(nasStatusWithEvents(0)),
    };

    const BUSY = {
      icao: 'BUSY',
      movements: ok(movementsWithCallsigns([ ...Array(50).fill('UAL2'), ...Array(50).fill('SWA2') ])),
      facility: ok(facilityWithRunways(4)),
      nasStatus: ok(nasStatusWithEvents(1)),
    };

    const ANC = {
      icao: 'ANC',
      movements: ok(movementsWithCallsigns([ ...Array(8).fill('FDX1'), ...Array(2).fill('UAL3'), ...Array(8).fill('FDX2'), ...Array(2).fill('SWA3') ])),
      facility: ok(facilityWithRunways(3)),
      nasStatus: ok(nasStatusWithEvents(0)),
    };

    const fixture = [SMALL, BUSY, ANC];
    const a = scoreAirports(fixture);
    const b = scoreAirports(fixture);
    expect(a).toEqual(b);
  });

  it('case group 6: cargo-carrier allowlist membership and null callsign handling', () => {
    // ensure DAL is present in the allowlist per plan
    expect(CARGO_CALLSIGN_PREFIXES.includes('DAL' as any)).toBe(true);

    const movements = movementsWithCallsigns(['DAL123', 'XYZ001', null]);
    const kpi = computeVolumeKpi(movements);
    // DAL classified as cargo per heuristic
    expect(kpi.cargoMovements).toBeGreaterThanOrEqual(1);
    // XYZ not in list -> passenger
    // null callsign never classified as cargo
    expect(kpi.passengerMovements).toBeGreaterThanOrEqual(1);
  });
});
