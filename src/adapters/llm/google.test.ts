import { describe, expect, it, vi } from 'vitest';

const generateContentMock = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

import { parseIntentWithLLM } from './google';

describe('parseIntentWithLLM', () => {
  it('parses a well-formed model response into the typed intent payload', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ intent: 'compare', airports: ['KATL', 'KSFO'] }),
    });

    const result = await parseIntentWithLLM('Compare KATL and KSFO');

    expect(result).toEqual({ intent: 'compare', airports: ['KATL', 'KSFO'] });
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ responseMimeType: 'application/json' }),
      }),
    );
  });

  it('rejects a model response that fails zod validation', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ intent: 'not-a-real-intent' }) });

    await expect(parseIntentWithLLM('garbage')).rejects.toThrow();
  });
});
