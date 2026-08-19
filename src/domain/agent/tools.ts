import { regionKeys, lookupAirports } from '@/domain/airports/regions';
import { buildScoringInputs } from '@/domain/scoring/buildScoringInputs';
import { scoreAirports, type ExpansionScore } from '@/domain/scoring/expansionScore';

// Tool schemas the agent selects from - kept to plain JSON Schema (parametersJsonSchema)
// rather than the provider's Type enum, since that's what @google/genai accepts directly.
export const TOOL_DECLARATIONS = [
  {
    name: 'resolve_region',
    description:
      'Resolve a named US region or metro area to its airport ICAO codes. Only for named regions/metros - not for airports already identified by name or code.',
    parametersJsonSchema: {
      type: 'object',
      properties: { region: { type: 'string', enum: regionKeys() } },
      required: ['region'],
    },
  },
  {
    name: 'score_airports',
    description: 'Compute expansion-opportunity scores for one or more airports, given their 4-letter ICAO codes.',
    parametersJsonSchema: {
      type: 'object',
      properties: { icaos: { type: 'array', items: { type: 'string' } } },
      required: ['icaos'],
    },
  },
] as const;

export type ToolName = (typeof TOOL_DECLARATIONS)[number]['name'];

export async function resolveRegion(args: { region: string }): Promise<{ icaos: string[] }> {
  return { icaos: lookupAirports(args.region).map((match) => match.icao) };
}

export async function scoreAirportsTool(args: { icaos: string[] }): Promise<{ scores: ExpansionScore[] }> {
  const inputs = await buildScoringInputs(args.icaos ?? []);
  return { scores: scoreAirports(inputs) };
}

export const TOOL_HANDLERS: Record<ToolName, (args: never) => Promise<unknown>> = {
  resolve_region: resolveRegion as (args: never) => Promise<unknown>,
  score_airports: scoreAirportsTool as (args: never) => Promise<unknown>,
};
