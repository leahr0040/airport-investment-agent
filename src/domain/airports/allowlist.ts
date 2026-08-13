/**
 * SEC-02 SSRF choke point: registry-backed identifier validation.
 *
 * The allowlist IS the registry's own key set (byIcao / byIata / LEGACY_CODE_ALIASES) — it
 * never maintains a separately hardcoded code list, which would drift from the registry the
 * moment the FAA data changes.
 *
 * Deliberately does NOT reuse `normalizeQuery` from resolve.ts: that normaliser strips
 * punctuation for resolution convenience, which would rehabilitate a malformed identifier
 * (URL, path traversal, control characters) into something that looks like a valid code before
 * it is shape-checked. Here we trim and uppercase only.
 */

import { z } from 'zod';
import type { AirportRef, Registry } from './types';
import { LEGACY_CODE_ALIASES } from './aliases';

/** Anchored: exactly 3 or 4 characters, uppercase A-Z or digits 0-9 only. */
export const AIRPORT_CODE_PATTERN = /^[A-Z0-9]{3,4}$/;

const MALFORMED = '(malformed identifier)';

export class UnknownAirportError extends Error {
  public code: string;

  constructor(code: string) {
    super(`Unknown airport identifier: ${code}`);
    this.name = 'UnknownAirportError';
    this.code = code;
  }
}

function shapeCheckedCode(raw: string): string | null {
  const candidate = raw.trim().toUpperCase();
  return AIRPORT_CODE_PATTERN.test(candidate) ? candidate : null;
}

function lookup(code: string, registry: Registry): AirportRef | undefined {
  const direct = registry.byIcao.get(code) ?? registry.byIata.get(code);
  if (direct) return direct;
  const aliasTarget = LEGACY_CODE_ALIASES[code];
  if (aliasTarget) return registry.byIcao.get(aliasTarget) ?? registry.byIata.get(aliasTarget);
  return undefined;
}

export function isAllowedAirportCode(raw: string, registry: Registry): boolean {
  const candidate = shapeCheckedCode(raw);
  if (!candidate) return false;
  return lookup(candidate, registry) !== undefined;
}

export function assertAllowedAirport(raw: string, registry: Registry): AirportRef {
  const candidate = shapeCheckedCode(raw);
  if (!candidate) {
    throw new UnknownAirportError(MALFORMED);
  }
  const airport = lookup(candidate, registry);
  if (!airport) {
    throw new UnknownAirportError(candidate);
  }
  return airport;
}

export function airportCodeSchema(registry: Registry) {
  return z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .refine((value) => AIRPORT_CODE_PATTERN.test(value), { message: MALFORMED })
    .transform((value) => assertAllowedAirport(value, registry));
}
