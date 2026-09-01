import type { Movements } from '../adapters/opensky.types';
import type { FaaFacility } from '../adapters/faaFacility';
import type { NasStatus } from '../adapters/nasStatus';
import { FailureKind, type AdapterResult } from '../adapters/types';

export const CARGO_CALLSIGN_PREFIXES = ['FDX', 'UPS', 'GTI', 'CKS', 'ABX', 'PAC', 'CLX', 'ACA', 'DAL', 'AAL'] as const;

export const SCORING_WEIGHTS = { volume: 1 / 3, headroom: 1 / 3, delayFrequency: 1 / 3 } as const;

export const VOLUME_PROXY_DISCLOSURE =
  'passengerMovements and cargoMovements are movement-count proxies (flights classified by callsign prefix), not measured passenger or cargo volume.';

export type VolumeKpi = {
  passengerMovements: number;
  cargoMovements: number;
  totalMovements: number;
  window: Movements['window'];
  measuredVsProxied: string;
};
export type HeadroomKpi = { movementsPerRunway: number; runwayCount: number; totalMovements: number };
export type DelayKpi = { eventCount: number };

type ComponentAvailable<T> = {
  available: true;
  kpi: T;
  normalized: number;
  contribution: number;
};

type ComponentUnavailable = { available: false; kpi: null; normalized: null; contribution: null; kind: FailureKind };

export type ComponentResult<T> = ComponentAvailable<T> | ComponentUnavailable;

export type ScoringComponentBreakdown = {
  volume: ComponentResult<VolumeKpi>;
  headroom: ComponentResult<HeadroomKpi>;
  delayFrequency: ComponentResult<DelayKpi>;
  weightPerComponent: number;
  availableComponentCount: number;
  coverage: string;
};

export type ExpansionScore = { icao: string; score: number; components: ScoringComponentBreakdown };

export type ScoringInput = {
  icao: string;
  movements: AdapterResult<Movements>;
  facility: AdapterResult<FaaFacility>;
  nasStatus: AdapterResult<NasStatus>;
};

export function isCargoCallsign(callsign: string | null): boolean {
  if (callsign === null) return false;
  const s = callsign.trim().toUpperCase();
  return CARGO_CALLSIGN_PREFIXES.some((p) => s.startsWith(p));
}

export function computeVolumeKpi(movements: Movements): VolumeKpi {
  const all = [...movements.departures, ...movements.arrivals];
  const totalMovements = movements.departureCount + movements.arrivalCount;
  const cargoMovements = all.filter((f) => isCargoCallsign(f.callsign)).length;
  const passengerMovements = Math.max(0, totalMovements - cargoMovements);
  return { passengerMovements, cargoMovements, totalMovements, window: movements.window, measuredVsProxied: VOLUME_PROXY_DISCLOSURE };
}

export function computeHeadroomKpi(movements: Movements, facility: FaaFacility): HeadroomKpi {
  const totalMovements = movements.departureCount + movements.arrivalCount;
  const runwayCount = facility.runways.length;
  const movementsPerRunway = totalMovements / Math.max(1, runwayCount);
  return { movementsPerRunway, runwayCount, totalMovements };
}

export function computeDelayKpi(nasStatus: NasStatus): DelayKpi {
  return { eventCount: nasStatus.events.length };
}

export function minMaxNormalize(value: number, dataset: number[]): number {
  if (dataset.length === 0) return 0;
  const min = Math.min(...dataset);
  const max = Math.max(...dataset);
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

function resolveVolume(input: ScoringInput): VolumeKpi | null {
  return input.movements.ok ? computeVolumeKpi(input.movements.data) : null;
}

function resolveHeadroom(input: ScoringInput): HeadroomKpi | null {
  if (!input.movements.ok || !input.facility.ok || input.facility.data.runways.length === 0) return null;
  return computeHeadroomKpi(input.movements.data, input.facility.data);
}

function resolveDelay(input: ScoringInput): DelayKpi | null {
  return input.nasStatus.ok ? computeDelayKpi(input.nasStatus.data) : null;
}

function volumeKind(input: ScoringInput): FailureKind {
  return input.movements.ok ? FailureKind.Unavailable : input.movements.kind;
}

function headroomKind(input: ScoringInput): FailureKind {
  if (!input.movements.ok) return input.movements.kind;
  if (!input.facility.ok) return input.facility.kind;
  return FailureKind.NoData;
}

function delayKind(input: ScoringInput): FailureKind {
  return input.nasStatus.ok ? FailureKind.Unavailable : input.nasStatus.kind;
}

function buildComponent<K>(
  kpi: K | null,
  metric: (k: K) => number,
  kind: FailureKind,
  dataset: number[],
  weight: number
): ComponentResult<K> {
  if (kpi === null) {
    return { available: false, kpi: null, normalized: null, contribution: null, kind };
  }
  const normalized = minMaxNormalize(metric(kpi), dataset);
  return { available: true, kpi, normalized, contribution: normalized * weight };
}

export function scoreAirports(inputs: ScoringInput[]): ExpansionScore[] {
  const resolved = inputs.map((input) => ({
    input,
    vol: resolveVolume(input),
    head: resolveHeadroom(input),
    delay: resolveDelay(input),
  }));

  const volumeDataset = resolved.filter((k) => k.vol).map((k) => k.vol!.passengerMovements);
  const headroomDataset = resolved.filter((k) => k.head).map((k) => k.head!.movementsPerRunway);
  const delayDataset = resolved.filter((k) => k.delay).map((k) => k.delay!.eventCount);

  return resolved.map(({ input, vol, head, delay }) => {
    const availableCount = [vol, head, delay].filter((k) => k !== null).length;
    const weightPerComponent = availableCount > 0 ? 1 / availableCount : 0;

    const volumeComponent = buildComponent(vol, (k) => k.passengerMovements, volumeKind(input), volumeDataset, weightPerComponent);
    const headroomComponent = buildComponent(head, (k) => k.movementsPerRunway, headroomKind(input), headroomDataset, weightPerComponent);
    const delayComponent = buildComponent(delay, (k) => k.eventCount, delayKind(input), delayDataset, weightPerComponent);

    const score = (volumeComponent.contribution ?? 0) + (headroomComponent.contribution ?? 0) + (delayComponent.contribution ?? 0);

    const components: ScoringComponentBreakdown = {
      volume: volumeComponent,
      headroom: headroomComponent,
      delayFrequency: delayComponent,
      weightPerComponent,
      availableComponentCount: availableCount,
      coverage: `${availableCount} of 3 components available`,
    };

    return { icao: input.icao, score, components };
  });
}
