import type { AxiosResponse } from 'axios';

// Only the fields the adapter clients actually read - a full AxiosResponse would need
// statusText/headers/config that no assertion ever looks at.
export function axiosResponse(
  status: number,
  data: unknown,
  request?: { method?: string; path?: string },
): AxiosResponse {
  return { status, data, request } as unknown as AxiosResponse;
}

export function econnaborted(): Error {
  return Object.assign(new Error('timeout of 3000ms exceeded'), { code: 'ECONNABORTED' });
}
