export type AdapterFailReason =
  | "timeout"
  | "invalid_input"
  | "rate_limited"
  | "no_data"
  | "error";

export type AdapterResult<T> =
  | {
      ok: true;
      data: T;
      fetchedAt: string;
      source: string;
    }
  | {
      ok: false;
      reason: AdapterFailReason;
      detail?: string;
    };

