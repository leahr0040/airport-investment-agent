/**
 * Offline unit coverage for the registry build: join correctness, row
 * validation drops, and the initRegistry/getRegistry singleton contract.
 * No real network calls — fetch is stubbed with small synthetic ArcGIS payloads.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRegistry } from './registry';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function facilityFeature(attrs: Record<string, unknown> = {}) {
  return {
    attributes: {
      ARPT_ID: 'AAA',
      ICAO_ID: 'KAAA',
      ARPT_NAME: 'Test Airport',
      CITY: 'Testville',
      STATE_CODE: 'GA',
      LAT_DECIMAL: 33.0,
      LONG_DECIMAL: -84.0,
      ...attrs,
    },
  };
}

function runwayFeature(attrs: Record<string, unknown> = {}) {
  return {
    attributes: {
      ARPT_ID: 'AAA',
      RWY_ID: '09/27',
      RWY_LEN: 10000,
      RWY_WIDTH: 150,
      LAT1_DECIMAL: 33.0,
      LONG1_DECIMAL: -84.0,
      LAT2_DECIMAL: 33.01,
      LONG2_DECIMAL: -84.0,
      SURFACE_TYPE_CODE: 'CONC',
      COND: 'G',
      ...attrs,
    },
  };
}

function page(features: { attributes: Record<string, unknown> }[]) {
  return { features };
}

// The drop-ratio guard (>5%) is a schema-drift detector tuned for a ~500-row
// real registry; padding fixtures with clean filler rows keeps these tests
// below that threshold without disabling the guard itself.
function fillerFacilities(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const id = `F${String(i).padStart(2, '0')}`;
    return facilityFeature({ ARPT_ID: id, ICAO_ID: `K${id}` });
  });
}

function fillerRunways(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const id = `F${String(i).padStart(2, '0')}`;
    return runwayFeature({ ARPT_ID: id, RWY_ID: `${i}/${i + 18}` });
  });
}

function stubTwoLayerFetch(
  facilityFeatures: { attributes: Record<string, unknown> }[],
  runwayFeatures: { attributes: Record<string, unknown> }[],
) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(page(facilityFeatures)))
    .mockResolvedValueOnce(jsonResponse(page(runwayFeatures)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildRegistry', () => {
  it('discards runway rows whose ARPT_ID is not in the facility set', async () => {
    stubTwoLayerFetch(
      [facilityFeature({ ARPT_ID: 'AAA', ICAO_ID: 'KAAA' })],
      [runwayFeature({ ARPT_ID: 'AAA' }), runwayFeature({ ARPT_ID: 'ZZZ', RWY_ID: '01/19' })],
    );

    const registry = await buildRegistry();

    expect(registry.byIata.get('AAA')?.runways).toHaveLength(1);
    expect(registry.byIata.has('ZZZ')).toBe(false);
  });

  it('drops a facility whose state code is not a key of STATE_TO_REGION', async () => {
    stubTwoLayerFetch(
      [
        facilityFeature({ ARPT_ID: 'AAA', ICAO_ID: 'KAAA' }),
        facilityFeature({ ARPT_ID: 'BBB', ICAO_ID: 'KBBB', STATE_CODE: 'PR' }),
        ...fillerFacilities(30),
      ],
      [runwayFeature({ ARPT_ID: 'AAA' }), runwayFeature({ ARPT_ID: 'BBB' }), ...fillerRunways(30)],
    );

    const registry = await buildRegistry();

    expect(registry.all).toHaveLength(31);
    expect(registry.byIata.has('BBB')).toBe(false);
    expect(registry.byIata.has('AAA')).toBe(true);
  });

  it('drops a facility row carrying a control character in ARPT_NAME', async () => {
    stubTwoLayerFetch(
      [
        facilityFeature({ ARPT_ID: 'AAA', ICAO_ID: 'KAAA' }),
        facilityFeature({ ARPT_ID: 'CCC', ICAO_ID: 'KCCC', ARPT_NAME: 'Bad\x07Name' }),
        ...fillerFacilities(30),
      ],
      [runwayFeature({ ARPT_ID: 'AAA' }), runwayFeature({ ARPT_ID: 'CCC' }), ...fillerRunways(30)],
    );

    const registry = await buildRegistry();

    expect(registry.all).toHaveLength(31);
    expect(registry.byIata.has('CCC')).toBe(false);
    expect(registry.byIata.has('AAA')).toBe(true);
  });

  it('drops a facility left with zero runways', async () => {
    stubTwoLayerFetch(
      [facilityFeature({ ARPT_ID: 'AAA', ICAO_ID: 'KAAA' }), facilityFeature({ ARPT_ID: 'DDD', ICAO_ID: 'KDDD' })],
      [runwayFeature({ ARPT_ID: 'AAA' })],
    );

    const registry = await buildRegistry();

    expect(registry.all).toHaveLength(1);
    expect(registry.byIata.has('DDD')).toBe(false);
  });

  it('drops a facility row missing ICAO_ID or carrying a non-numeric latitude without crashing the build', async () => {
    stubTwoLayerFetch(
      [
        facilityFeature({ ARPT_ID: 'AAA', ICAO_ID: 'KAAA' }),
        facilityFeature({ ARPT_ID: 'EEE', ICAO_ID: '' }),
        facilityFeature({ ARPT_ID: 'FFF', ICAO_ID: 'KFFF', LAT_DECIMAL: 'not-a-number' }),
        ...fillerFacilities(40),
      ],
      [
        runwayFeature({ ARPT_ID: 'AAA' }),
        runwayFeature({ ARPT_ID: 'EEE' }),
        runwayFeature({ ARPT_ID: 'FFF' }),
        ...fillerRunways(40),
      ],
    );

    const registry = await buildRegistry();

    expect(registry.all).toHaveLength(41);
    expect(registry.byIata.has('EEE')).toBe(false);
    expect(registry.byIata.has('FFF')).toBe(false);
    expect(registry.byIata.has('AAA')).toBe(true);
  });
});

describe('getRegistry / initRegistry', () => {
  it('getRegistry() throws RegistryNotInitialisedError before any build', async () => {
    vi.resetModules();
    const fresh = await import('./registry');
    expect(() => fresh.getRegistry()).toThrow(fresh.RegistryNotInitialisedError);
  });

  it('initRegistry() called twice performs exactly one fetch pass', async () => {
    vi.resetModules();
    const fresh = await import('./registry');
    const fetchMock = stubTwoLayerFetch(
      [facilityFeature({ ARPT_ID: 'AAA', ICAO_ID: 'KAAA' })],
      [runwayFeature({ ARPT_ID: 'AAA' })],
    );

    const first = await fresh.initRegistry();
    const second = await fresh.initRegistry();

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one facility page + one runway page, not four
  });
});
