import { beforeEach, describe, expect, it } from 'vitest';
import { econnaborted, getTransport, resetTransport } from '@test/helpers/axios';
import { createHttpClient, okOr } from './http';

describe('createHttpClient', () => {
  beforeEach(() => {
    resetTransport();
  });

  it.each([200, 201, 204, 299])('resolves %i as a success', async (status) => {
    getTransport.mockResolvedValue({ status, data: 'ok' });

    const response = await createHttpClient().get('https://example.test/');

    expect(response.status).toBe(status);
  });

  it.each([300, 400, 429, 500])('rejects %i with an unavailable AdapterError', async (status) => {
    getTransport.mockResolvedValue({ status, data: 'nope' });

    await expect(createHttpClient().get('https://example.test/')).rejects.toMatchObject({
      name: 'UpstreamError',
      kind: 'unavailable',
    });
  });

  it('lets one call widen the accepted statuses without affecting the next', async () => {
    getTransport.mockResolvedValue({ status: 404, data: '' });
    const http = createHttpClient();

    const response = await http.get('https://example.test/', { validateStatus: okOr(404) });
    expect(response.status).toBe(404);

    await expect(http.get('https://example.test/')).rejects.toMatchObject({ name: 'UpstreamError' });
  });

  it('lets one call name its own failure without affecting the next', async () => {
    getTransport.mockResolvedValue({ status: 500, data: '' });
    const http = createHttpClient();

    await expect(http.get('https://example.test/', { errorName: 'TokenFetchFailed' })).rejects.toMatchObject({
      name: 'TokenFetchFailed',
    });

    await expect(http.get('https://example.test/')).rejects.toMatchObject({ name: 'UpstreamError' });
  });

  it('wraps a transport failure in an AdapterError named after its code', async () => {
    getTransport.mockRejectedValue(econnaborted());

    await expect(createHttpClient().get('https://example.test/')).rejects.toMatchObject({
      name: 'ECONNABORTED',
      kind: 'unavailable',
    });
  });
});
