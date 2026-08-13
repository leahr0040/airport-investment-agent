/**
 * Paginated ArcGIS FeatureServer query helper shared by both FAA layers.
 *
 * No I/O beyond Node's global `fetch`; no HTTP client dependency.
 */

// Hardcoded, never environment-configurable: making the upstream host a config
// value would hand an SSRF lever to anyone who can influence the environment.
export const ARCGIS_BASE = 'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services';

const PAGE_SIZE = 2000;
const MAX_PAGES = 20;

export class ArcGisQueryError extends Error {
  public layer: string;

  constructor(layer: string, message: string) {
    super(`ArcGIS query failed for layer "${layer}": ${message}`);
    this.name = 'ArcGisQueryError';
    this.layer = layer;
  }
}

export async function queryAllFeatures(
  layer: string,
  where: string,
  outFields: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${ARCGIS_BASE}/${layer}/FeatureServer/0/query`);
    url.searchParams.set('where', where);
    url.searchParams.set('outFields', outFields);
    url.searchParams.set('f', 'json');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('resultRecordCount', String(PAGE_SIZE));
    url.searchParams.set('orderByFields', 'OBJECTID');
    url.searchParams.set('resultOffset', String(offset));

    const res = await fetch(url.toString(), { signal });
    if (!res.ok) {
      throw new ArcGisQueryError(layer, `HTTP ${res.status}`);
    }

    const body = (await res.json()) as {
      features?: { attributes: Record<string, unknown> }[];
      exceededTransferLimit?: boolean;
      error?: { code?: number; message?: string };
    };

    if (body.error) {
      throw new ArcGisQueryError(layer, body.error.message ?? `ArcGIS error ${body.error.code ?? ''}`.trim());
    }

    results.push(...(body.features ?? []).map((f) => f.attributes));

    // Trust the flag, not the row count — a page can return zero features and
    // still have more pages (Esri's documented, if counterintuitive, contract).
    if (!body.exceededTransferLimit) {
      return results;
    }
    offset += PAGE_SIZE;
  }

  throw new ArcGisQueryError(layer, `exceeded ${MAX_PAGES} pages without exceededTransferLimit clearing`);
}
