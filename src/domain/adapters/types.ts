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
      // Detail must be only a status code or error name, never a response body, header, token, or credential.
      detail?: string;
    };

// D-06 hard-fails upstream errors; do not restore a stale-serving branch.
