import type { AxiosInstance } from 'axios';
import { FailureKind } from './types';
import { AdapterError } from './errors';
import { createHttpClient, httpContext } from './http';

const ARCGIS_BASE = 'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services';
const FACILITY_FIELDS = 'ARPT_ID,ICAO_ID,ARPT_NAME,LAT_DECIMAL,LONG_DECIMAL,FACILITY_USE_CODE,FAR_139_TYPE_CODE';
const RUNWAY_FIELDS = 'ARPT_ID,RWY_ID,RWY_LEN,RWY_WIDTH,LAT1_DECIMAL,LONG1_DECIMAL,LAT2_DECIMAL,LONG2_DECIMAL';

type ArcGisBody = {
  features?: { attributes: Record<string, unknown> }[];
  error?: { code?: number; message?: string };
};

export class FaaFacilityClient {
  constructor(private readonly http: AxiosInstance = createHttpClient({ baseURL: ARCGIS_BASE })) {}

  private async queryFeatures(layer: string, where: string, outFields: string): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams({ where, outFields, f: 'json', returnGeometry: 'false' });
    const response = await this.http.get(`/${layer}/FeatureServer/0/query?${params}`);

    const body = response.data as ArcGisBody;
    if (body?.error) {
      throw new AdapterError('ArcGisError', FailureKind.Unavailable, {
        ...httpContext(response),
        data: body.error,
      });
    }

    return (body.features ?? []).map((f) => f.attributes);
  }

  async fetchFacilityRows(icao: string): Promise<Record<string, unknown>[]> {
    return this.queryFeatures('NTAD_Aviation_Facilities', `ICAO_ID='${icao}'`, FACILITY_FIELDS);
  }

  async fetchRunwayRows(faaLid: string): Promise<Record<string, unknown>[]> {
    return this.queryFeatures('Runways_View', `ARPT_ID='${faaLid}'`, RUNWAY_FIELDS);
  }
}

export const faaFacilityClient = new FaaFacilityClient();