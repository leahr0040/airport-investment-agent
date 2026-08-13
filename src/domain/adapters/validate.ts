// This gates URL-interpolated OpenSky input as an injection control; for FAA NAS Status's fixed URL, it is only a correctness check.
const ICAO_PATTERN = /^[A-Z]{4}$/;
const IATA_PATTERN = /^[A-Z]{3}$/;

export function isValidIcao(code: string): boolean {
  return ICAO_PATTERN.test(code);
}

export function isValidIata(code: string): boolean {
  return IATA_PATTERN.test(code);
}
