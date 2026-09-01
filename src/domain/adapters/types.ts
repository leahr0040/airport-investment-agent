export type HttpResponse = {
  status: number;
  data: unknown;
  request?: { method?: string; path?: string };
};

export enum FailureKind {
  NoData = "no_data",
  InvalidInput = "invalid_input",
  Unavailable = "unavailable",
}

export type AdapterResult<T> =
  | {
      ok: true;
      data: T;
      fetchedAt: string;
      source: string;
    }
  | {
      ok: false;
      kind: FailureKind;
      detail?: string;
    };
