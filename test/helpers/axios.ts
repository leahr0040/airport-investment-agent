import { vi } from 'vitest';
import { AxiosError } from 'axios';
import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

export type StubResponse = { status: number; data: unknown };
type Handler = (config: AxiosRequestConfig) => Promise<StubResponse> | StubResponse;

// Requests made through createHttpClient() in tests land here, split by method so a test can
// count token POSTs separately from data GETs. Stubbing the adapter rather than mocking the
// axios module keeps the real instance, so createHttpClient's interceptors run and are covered.
export const getTransport = vi.fn<Handler>();
export const postTransport = vi.fn<Handler>();

export function resetTransport(): void {
  getTransport.mockReset();
  postTransport.mockReset();
}

export async function stubAdapter(config: AxiosRequestConfig): Promise<AxiosResponse> {
  const handler = (config.method ?? 'get').toLowerCase() === 'post' ? postTransport : getTransport;
  const { status, data } = await handler(config);
  const response = {
    status,
    data,
    statusText: '',
    headers: {},
    config,
    request: { method: config.method, path: config.url },
  } as unknown as AxiosResponse;

  // A custom adapter is responsible for applying validateStatus - axios's built-in adapters do
  // it through settle(), and skipping it here would let every non-2xx resolve as a success.
  if (config.validateStatus && !config.validateStatus(status)) {
    throw new AxiosError(
      `Request failed with status code ${status}`,
      undefined,
      config as InternalAxiosRequestConfig,
      response.request,
      response,
    );
  }

  return response;
}

export function axiosResponse(status: number, data: unknown): StubResponse {
  return { status, data };
}

export function requestConfig(callIndex = 0): AxiosRequestConfig {
  return getTransport.mock.calls[callIndex][0];
}

export function requestUrl(callIndex = 0): string {
  const config = requestConfig(callIndex);
  return decodeURIComponent(`${config.baseURL ?? ''}${config.url ?? ''}`);
}

export function econnaborted(): Error {
  return Object.assign(new Error('timeout of 3000ms exceeded'), { code: 'ECONNABORTED' });
}
