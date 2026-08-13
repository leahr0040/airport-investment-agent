import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/adapters/llm/google', () => ({ parseIntentWithLLM: vi.fn() }));
vi.mock('@/domain/adapters/opensky', () => ({ fetchMovements: vi.fn() }));
vi.mock('@/domain/adapters/faaFacility', () => ({ fetchFaaFacility: vi.fn() }));
vi.mock('@/domain/adapters/nasStatus', () => ({ fetchNasStatus: vi.fn() }));

import { parseIntentWithLLM } from '@/adapters/llm/google';
import { fetchMovements } from '@/domain/adapters/opensky';
import { fetchFaaFacility } from '@/domain/adapters/faaFacility';
import { fetchNasStatus } from '@/domain/adapters/nasStatus';
import { POST } from './route';

function postRequest(body: unknown, sessionId: string) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-id': sessionId },
    body: JSON.stringify(body),
  });
}

function movementsOk(icao: string, departureCount: number) {
  return {
    ok: true as const,
    data: {
      icao,
      window: { begin: 0, end: 1, beginIso: '', endIso: '' },
      departures: [],
      arrivals: [],
      departureCount,
      arrivalCount: 50,
      unknownDestinationCount: 0,
      unknownOriginCount: 0,
    },
    fetchedAt: '2026-01-01T00:00:00.000Z',
    source: 'test',
  };
}

function facilityOk(icao: string) {
  return {
    ok: true as const,
    data: {
      icao,
      faaLid: icao.slice(1),
      name: `${icao} Airport`,
      lat: 0,
      lon: 0,
      facilityUseCode: 'PU',
      far139TypeCode: 'I',
      runways: [{ runwayId: '01/19', lengthFt: 10000, widthFt: 150, end1: null, end2: null }],
    },
    fetchedAt: '2026-01-01T00:00:00.000Z',
    source: 'test',
  };
}

function nasStatusOk(icao: string) {
  return {
    ok: true as const,
    data: { lid: icao.slice(1), icao, updateTime: null, events: [] },
    fetchedAt: '2026-01-01T00:00:00.000Z',
    source: 'test',
  };
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.mocked(parseIntentWithLLM).mockResolvedValue({ intent: 'compare', airports: ['KATL', 'KSFO'] });
    vi.mocked(fetchMovements).mockImplementation(async (icao: string) => movementsOk(icao, icao === 'KATL' ? 500 : 100));
    vi.mocked(fetchFaaFacility).mockImplementation(async (icao: string) => facilityOk(icao));
    vi.mocked(fetchNasStatus).mockImplementation(async (icao: string) => nasStatusOk(icao));
  });

  it('returns a narrated answer with numbers taken from the scoring engine', async () => {
    const res = await POST(postRequest({ query: 'Compare KATL and KSFO' }, `s-${Date.now()}`));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.scores).toHaveLength(2);
    expect(body.data.narrative).toContain('KATL');

    const katl = body.data.scores.find((score: { icao: string }) => score.icao === 'KATL');
    const ksfo = body.data.scores.find((score: { icao: string }) => score.icao === 'KSFO');
    // KATL was mocked with the larger movement count, so it should score higher.
    expect(katl.score).toBeGreaterThan(ksfo.score);
  });

  it('rejects a session once it exceeds the rate limit', async () => {
    const sessionId = `burst-${Date.now()}`;
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await POST(postRequest({ query: 'Compare KATL and KSFO' }, sessionId));
    }
    expect(last!.status).toBe(429);
  });
});
