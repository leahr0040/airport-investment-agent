import axios from 'axios';
import { FailureKind, type HttpResponse } from './types';
import { AdapterError, toNetworkError } from './errors';

export type HttpClient = {
  get: (url: string, config: Record<string, unknown>) => Promise<HttpResponse>;
};

export class FaaFacilityClient {
  private readonly timeoutMs: number;

  constructor(timeoutMs = 3000, private http: HttpClient = axios as unknown as HttpClient) {
    this.timeoutMs = timeoutMs;
  }

  private async queryFeatures(layer: string, where: string, outFields: string): Promise<Record<string, unknown>[]> {
    const ARCGIS_BASE = 'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services';
    const params = new URLSearchParams({ where, outFields, f: 'json', returnGeometry: 'false' });
    const url = `${ARCGIS_BASE}/${layer}/FeatureServer/0/query?${params}`;

    let response;
    try {
      response = await this.http.get(url, { timeout: this.timeoutMs, validateStatus: () => true });
    } catch (err) {
      throw toNetworkError(err);
    }

    if (response.status !== 200) {
      throw new AdapterError('UpstreamError', FailureKind.Unavailable, {
        method: response.request?.method,
        path: response.request?.path,
        status: response.status,
        data: response.data,
      });
    }

    const body = response.data as { features?: { attributes: Record<string, unknown> }[]; error?: { code?: number; message?: string } };
    if (body?.error) {
      throw new AdapterError('ArcGisError', FailureKind.Unavailable, {
        method: response.request?.method,
        path: response.request?.path,
        status: response.status,
        data: body.error,
      });
    }

    return (body.features ?? []).map((f) => f.attributes);
  }

  async fetchFacilityRows(icao: string): Promise<Record<string, unknown>[]> {
    const FACILITY_FIELDS = 'ARPT_ID,ICAO_ID,ARPT_NAME,LAT_DECIMAL,LONG_DECIMAL,FACILITY_USE_CODE,FAR_139_TYPE_CODE';
    return this.queryFeatures('NTAD_Aviation_Facilities', `ICAO_ID='${icao}'`, FACILITY_FIELDS);
  }

  async fetchRunwayRows(faaLid: string): Promise<Record<string, unknown>[]> {
    const RUNWAY_FIELDS = 'ARPT_ID,RWY_ID,RWY_LEN,RWY_WIDTH,LAT1_DECIMAL,LONG1_DECIMAL,LAT2_DECIMAL,LONG2_DECIMAL';
    return this.queryFeatures('Runways_View', `ARPT_ID='${faaLid}'`, RUNWAY_FIELDS);
  }
}

export const faaFacilityClient = new FaaFacilityClient();
