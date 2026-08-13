import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { getEnv } from '@/config/env';

const IntentSchema = z.object({
  intent: z.enum(['compare', 'rank', 'describe', 'unknown']),
  airports: z.array(z.string()).optional(),
  timeWindow: z
    .object({ begin: z.string().optional(), end: z.string().optional() })
    .optional(),
});

export type IntentPayload = z.infer<typeof IntentSchema>;

function client(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: getEnv().GOOGLE_GENERATIVE_AI_API_KEY });
}

export async function parseIntentWithLLM(query: string): Promise<IntentPayload> {
  const prompt = `Extract the user's intent and a list of airport identifiers (4-letter ICAO codes) from the query. Respond with JSON only.\n\nUser query: "${query}"`;

  const response = await client().models.generateContent({
    model: getEnv().GOOGLE_GENERATIVE_AI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(IntentSchema),
    },
  });

  // Re-validated with the same schema the model was constrained to, not trusted as-is:
  // Gemini's JSON Schema subset can't express every zod constraint (e.g. enum values).
  return IntentSchema.parse(JSON.parse(response.text ?? '{}'));
}

export async function narrateAnswer(structuredResult: unknown): Promise<string> {
  const prompt = `Given the structured result below, produce a concise narrated answer for an analyst. Include numeric values from the structured data and reference the ICAO codes.\n\nStructured:\n${JSON.stringify(structuredResult, null, 2)}`;

  const response = await client().models.generateContent({
    model: getEnv().GOOGLE_GENERATIVE_AI_MODEL,
    contents: prompt,
  });

  return response.text ?? '';
}
