import type { Movements } from '../adapters/opensky.types';
import type { FaaFacility } from '../adapters/faaFacility';
import type { NasStatus } from '../adapters/nasStatus';
import type { AdapterResult, AdapterFailReason } from '../adapters/types';

// Cargo-callsign allowlist. ASSUMED / not exhaustive: curated from RESEARCH.md assumptions.
export const CARGO_CALLSIGN_PREFIXES = ['FDX', 'UPS', 'GTI', 'CKS', 'ABX', 'PAC', 'CLX', 'ACA', 'DAL', 'AAL'] as const;

export const SCORING_WEIGHTS = { volume: 1 / 3, headroom: 1 / 3, delayFrequency: 1 / 3 } as const;

export type VolumeKpi = { passengerMovements: number; cargoMovements: number; totalMovements: number };
export type HeadroomKpi = { movementsPerRunway: number; runwayCount: number; totalMovements: number };
export type DelayKpi = { eventCount: number };

type ComponentAvailable<T> = {
  available: true;
  kpi: T;
  normalized: number;
  contribution: number;
};

type ComponentUnavailable = { available: false; kpi: null; normalized: null; contribution: null; reason: AdapterFailReason };

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
  let cargoMovements = 0;
  for (const f of all) {
    if (isCargoCallsign(f.callsign)) cargoMovements += 1;
  }
  const passengerMovements = Math.max(0, totalMovements - cargoMovements);
  return { passengerMovements, cargoMovements, totalMovements };
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

export function scoreAirports(inputs: ScoringInput[]): ExpansionScore[] {
  // Pure function: no side effects, deterministic output.

  // Build datasets per component from available inputs
  const volumeDataset: number[] = [];
  const headroomDataset: number[] = [];
  const delayDataset: number[] = [];

  // temporary store KPIs per input
  const tmp = inputs.map((input) => {
    const vol = input.movements.ok ? computeVolumeKpi(input.movements.data) : null;
    const head = input.movements.ok && input.facility.ok ? computeHeadroomKpi(input.movements.data, input.facility.data) : null;
    const delay = input.nasStatus.ok ? computeDelayKpi(input.nasStatus.data) : null;
    if (vol) volumeDataset.push(vol.passengerMovements);
    if (head) headroomDataset.push(head.movementsPerRunway);
    if (delay) delayDataset.push(delay.eventCount);
    return { input, vol, head, delay } as const;
  });

  // helper to safely extract adapter failure reasons
  function reasonOf<T>(r: AdapterResult<T>): AdapterFailReason | null {
    return r.ok ? null : r.reason;
  }

  return tmp.map(({ input, vol, head, delay }) => {
    const volumeAvailable = vol !== null;
    const headroomAvailable = head !== null;
    const delayAvailable = delay !== null;

    const availableCount = [volumeAvailable, headroomAvailable, delayAvailable].filter(Boolean).length;
    const weightPerComponent = availableCount > 0 ? 1 / availableCount : 0;

    const volumeComponent: ComponentResult<VolumeKpi> = volumeAvailable
      ? {
          available: true,
          kpi: vol!,
          normalized: minMaxNormalize(vol!.passengerMovements, volumeDataset),
          contribution: 0, // set below
        }
      : { available: false, kpi: null, normalized: null, contribution: null, reason: reasonOf(input.movements) ?? 'error' };

    const headroomComponent: ComponentResult<HeadroomKpi> = headroomAvailable
      ? {
          available: true,
          kpi: head!,
          normalized: minMaxNormalize(head!.movementsPerRunway, headroomDataset),
          contribution: 0,
        }
      : {
          available: false,
          kpi: null,
          normalized: null,
          contribution: null,
          reason: reasonOf(input.movements) ?? reasonOf(input.facility) ?? 'error',
        };

    const delayComponent: ComponentResult<DelayKpi> = delayAvailable
      ? { available: true, kpi: delay!, normalized: minMaxNormalize(delay!.eventCount, delayDataset), contribution: 0 }
      : { available: false, kpi: null, normalized: null, contribution: null, reason: reasonOf(input.nasStatus) ?? 'error' };

    // compute contributions
    if (volumeComponent.available) volumeComponent.contribution = volumeComponent.normalized * weightPerComponent;
    if (headroomComponent.available) headroomComponent.contribution = headroomComponent.normalized * weightPerComponent;
    if (delayComponent.available) delayComponent.contribution = delayComponent.normalized * weightPerComponent;

    const score = (volumeComponent.contribution ?? 0) + (headroomComponent.contribution ?? 0) + (delayComponent.contribution ?? 0);

    const coverage = `${availableCount} of 3 components available`;

    const components: ScoringComponentBreakdown = {
      volume: volumeComponent,
      headroom: headroomComponent,
      delayFrequency: delayComponent,
      weightPerComponent,
      availableComponentCount: availableCount,
      coverage,
    };

    return { icao: input.icao, score, components };
  });
}
