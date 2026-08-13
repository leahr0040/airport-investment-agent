import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { clearCache } from './cache';
import { fetchNasStatus, toFaaLid } from './nasStatus';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

function feed(delayTypeXml: string, updateTime = '2026-08-13T10:00:00Z') {
  return `<?xml version="1.0"?>
    <AIRPORT_STATUS_INFORMATION>
      <Update_Time>${updateTime}</Update_Time>
      ${delayTypeXml}
    </AIRPORT_STATUS_INFORMATION>`;
}

const CLOSURE_ATL = `
  <Delay_type>
    <Name>Airport Closures</Name>
    <Airport_Closure_List>
      <Airport>
        <ARPT>ATL</ARPT>
        <Reason>Test closure</Reason>
        <Start>2026-08-13T09:00:00Z</Start>
        <Reopen>2026-08-13T11:00:00Z</Reopen>
      </Airport>
    </Airport_Closure_List>
  </Delay_type>`;

describe('FAA NAS Status adapter', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    clearCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects malformed codes before any network call', async () => {
    await expect(fetchNasStatus('katl')).resolves.toMatchObject({ ok: false, reason: 'invalid_input' });
    await expect(fetchNasStatus('ATL')).resolves.toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(mockedAxios.get).toHaveBeenCalledTimes(0);
  });

  it('derives the FAA location identifier from ICAO, not IATA', () => {
    expect(toFaaLid('KATL')).toBe('ATL');
    expect(toFaaLid('KPBI')).toBe('PBI');
    expect(toFaaLid('PANC')).toBe('ANC');
    expect(toFaaLid('PHNL')).toBe('HNL');
  });

  it('parses the closure block and returns a matching event for KATL', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: feed(CLOSURE_ATL) } as never);

    const res = await fetchNasStatus('KATL');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok result');
    expect(res.source).toBe('faa-nas-status');
    expect(res.data.lid).toBe('ATL');
    expect(res.data.updateTime).toBe('2026-08-13T10:00:00Z');
    expect(res.data.events).toHaveLength(1);
    expect(res.data.events[0]).toMatchObject({
      type: 'Airport Closures',
      reason: 'Test closure',
      start: '2026-08-13T09:00:00Z',
      reopen: '2026-08-13T11:00:00Z',
    });
  });

  it('returns ok true with an empty event list for a healthy airport', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: feed(CLOSURE_ATL) } as never);

    const res = await fetchNasStatus('KORD');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.events).toEqual([]);
  });

  it('parses a single-element list (one Delay_type, one Airport) as an event, not a dropped object', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: feed(CLOSURE_ATL) } as never);

    const res = await fetchNasStatus('KATL');
    if (!res.ok) throw new Error('expected ok result');
    expect(res.data.events).toHaveLength(1);
  });

  it('returns exactly one event from two Delay_type blocks, tagged with the matching block name', async () => {
    const groundStopOrd = `
      <Delay_type>
        <Name>Ground Stops</Name>
        <Ground_Stop_List>
          <Airport>
            <ARPT>ORD</ARPT>
            <Reason>Weather</Reason>
          </Airport>
        </Ground_Stop_List>
      </Delay_type>`;
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: feed(CLOSURE_ATL + groundStopOrd) } as never);

    const res = await fetchNasStatus('KATL');
    if (!res.ok) throw new Error('expected ok result');
    expect(res.data.events).toHaveLength(1);
    expect(res.data.events[0].type).toBe('Airport Closures');
  });

  it('yields an event from an unrecognised Delay_type block name (generic walk, not a hardcoded switch)', async () => {
    const mysteryBlock = `
      <Delay_type>
        <Name>Some Future Delay Category</Name>
        <Some_Future_List>
          <Entry>
            <ARPT>ATL</ARPT>
            <Reason>New category</Reason>
          </Entry>
        </Some_Future_List>
      </Delay_type>`;
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: feed(mysteryBlock) } as never);

    const res = await fetchNasStatus('KATL');
    if (!res.ok) throw new Error('expected ok result');
    expect(res.data.events).toHaveLength(1);
    expect(res.data.events[0].type).toBe('Some Future Delay Category');
  });

  it('matches the FAA LID divergence: KPBI queries PBI via the generic prefix-strip rule', async () => {
    const closurePbi = `
      <Delay_type>
        <Name>Airport Closures</Name>
        <Airport_Closure_List>
          <Airport>
            <ARPT>PBI</ARPT>
            <Reason>Runway work</Reason>
          </Airport>
        </Airport_Closure_List>
      </Delay_type>`;
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: feed(closurePbi) } as never);

    const res = await fetchNasStatus('KPBI');
    if (!res.ok) throw new Error('expected ok result');
    expect(res.data.lid).toBe('PBI');
    expect(res.data.events).toHaveLength(1);
  });

  it('matches non-K prefixed ICAO codes (Alaska/Hawaii) against their 3-letter LID', async () => {
    const closureAnc = `
      <Delay_type>
        <Name>Airport Closures</Name>
        <Airport_Closure_List>
          <Airport>
            <ARPT>ANC</ARPT>
            <Reason>Snow</Reason>
          </Airport>
        </Airport_Closure_List>
      </Delay_type>`;
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: feed(closureAnc) } as never);

    const res = await fetchNasStatus('PANC');
    if (!res.ok) throw new Error('expected ok result');
    expect(res.data.lid).toBe('ANC');
    expect(res.data.events).toHaveLength(1);
  });

  it('fetches the whole feed once for two different airports (shared cache key)', async () => {
    mockedAxios.get.mockResolvedValue({ status: 200, data: feed(CLOSURE_ATL) } as never);

    await fetchNasStatus('KATL');
    await fetchNasStatus('KORD');

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after the NAS TTL expires', async () => {
    mockedAxios.get.mockResolvedValue({ status: 200, data: feed(CLOSURE_ATL) } as never);

    await fetchNasStatus('KATL');
    vi.advanceTimersByTime(3 * 60 * 1000 + 1);
    await fetchNasStatus('KATL');

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['timeout', () => Promise.reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })), 'timeout'],
    ['rate_limited', () => Promise.resolve({ status: 429, data: '' }), 'rate_limited'],
    ['server error', () => Promise.resolve({ status: 503, data: '' }), 'error'],
  ])('maps a %s upstream failure to reason %s', async (_label, mockImpl, expectedReason) => {
    mockedAxios.get.mockImplementationOnce(mockImpl as never);

    const res = await fetchNasStatus('KATL');
    expect(res).toMatchObject({ ok: false, reason: expectedReason });
  });

  it('never leaks upstream free text into a failure detail', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 503, data: 'secret upstream body text' } as never);

    const res = await fetchNasStatus('KATL');
    if (res.ok) throw new Error('expected failure result');
    expect(res.detail ?? '').not.toContain('secret upstream body text');
  });

  it('parses entity-escaped free text in Reason without throwing', async () => {
    const closureWithEntities = `
      <Delay_type>
        <Name>Airport Closures</Name>
        <Airport_Closure_List>
          <Airport>
            <ARPT>ATL</ARPT>
            <Reason>Wind &amp; rain, gusts &gt; 40kt</Reason>
          </Airport>
        </Airport_Closure_List>
      </Delay_type>`;
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: feed(closureWithEntities) } as never);

    const res = await fetchNasStatus('KATL');
    if (!res.ok) throw new Error('expected ok result');
    expect(typeof res.data.events[0].reason).toBe('string');
    expect(res.data.events[0].reason).toBe('Wind & rain, gusts > 40kt');
  });
});
