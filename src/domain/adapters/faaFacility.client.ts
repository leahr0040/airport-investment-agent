import axios from 'axios';

type HttpResponse = { status: number; data: unknown };
export type HttpClient = {
  get: (url: string, config: Record<string, unknown>) => Promise<HttpResponse>;
};

// copied timeout normalizer pattern from other clients
export class FaaFacilityClient {
  private readonly timeoutMs: number;

  constructor(timeoutMs = 3000, private http: HttpClient = axios as unknown as HttpClient) {
    this.timeoutMs = timeoutMs;
  }

  // axios's `timeout` option rejects with code ECONNABORTED - normalize to a named TimeoutError
  private normalizeTimeout(err: unknown): unknown {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ECONNABORTED') {
      return Object.assign(new Error('TimeoutError'), { name: 'TimeoutError' });
    }
    return err;
  }

  private async queryFeatures(layer: string, where: string, outFields: string): Promise<Record<string, unknown>[]> {
    const ARCGIS_BASE = 'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services';
    const url = `${ARCGIS_BASE}/${layer}/FeatureServer/0/query`;
    const params = new URLSearchParams();
    params.append('where', where);
    params.append('outFields', outFields);
    params.append('f', 'json');
    params.append('returnGeometry', 'false');

    let response;
    try {
      response = await this.http.get(`${url}?${params.toString()}`, { timeout: this.timeoutMs, validateStatus: () => true });
    } catch (err) {
      throw this.normalizeTimeout(err);
    }

    if (response.status === 429) {
      throw Object.assign(new Error('rate_limited'), { reason: 'rate_limited' });
    }

    if (response.status !== 200) {
      throw Object.assign(new Error('upstream'), { reason: 'error' });
    }

    const body = response.data as { features?: { attributes: Record<string, unknown> }[]; error?: { code?: number; message?: string } };
    if (body && typeof body === 'object' && 'error' in body && (body as any).error) {
      const errMsg = (body as any).error?.message ?? 'ArcGisError';
      throw Object.assign(new Error(errMsg), { reason: 'error' });
    }

    return (body.features ?? []).map((f) => f.attributes);
  }

  // Caller must validate icao format before calling
  async fetchFacilityRows(icao: string): Promise<Record<string, unknown>[]> {
    const FACILITY_FIELDS = 'ARPT_ID,ICAO_ID,ARPT_NAME,LAT_DECIMAL,LONG_DECIMAL,FACILITY_USE_CODE,FAR_139_TYPE_CODE';
    return this.queryFeatures('NTAD_Aviation_Facilities', `ICAO_ID='${icao}'`, FACILITY_FIELDS);
  }

  // Caller must validate FAA LID (IATA-like) before calling
  async fetchRunwayRows(faaLid: string): Promise<Record<string, unknown>[]> {
    const RUNWAY_FIELDS = 'ARPT_ID,RWY_ID,RWY_LEN,RWY_WIDTH,LAT1_DECIMAL,LONG1_DECIMAL,LAT2_DECIMAL,LONG2_DECIMAL';
    return this.queryFeatures('Runways_View', `ARPT_ID='${faaLid}'`, RUNWAY_FIELDS);
  }
}

export const faaFacilityClient = new FaaFacilityClient();
