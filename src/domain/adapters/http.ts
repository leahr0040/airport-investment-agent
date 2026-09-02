import axios, { type AxiosAdapter, type AxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import { FailureKind } from './types';
import { AdapterError, toNetworkError } from './errors';

declare module 'axios' {
  interface AxiosRequestConfig {
    errorName?: string;
  }
}

type Options = {
  baseURL?: string;
  timeoutMs?: number;
  adapter?: AxiosAdapter;
};

export const okOr = (...extra: number[]) => (status: number) =>
  (status >= 200 && status < 300) || extra.includes(status);

export function httpContext(response: AxiosResponse): Record<string, unknown> {
  const request = response.request as { method?: string; path?: string } | undefined;
  return { method: request?.method, path: request?.path, status: response.status };
}

export function createHttpClient({ baseURL, timeoutMs = 3000, adapter }: Options = {}): AxiosInstance {
  const instance = axios.create({ baseURL, timeout: timeoutMs, adapter, validateStatus: okOr() });

  instance.interceptors.response.use(undefined, (err: AxiosError) => {
    if (!err.response) throw toNetworkError(err);
    throw new AdapterError(err.config?.errorName ?? 'UpstreamError', FailureKind.Unavailable, {
      ...httpContext(err.response),
      data: err.response.data,
    });
  });

  return instance;
}
