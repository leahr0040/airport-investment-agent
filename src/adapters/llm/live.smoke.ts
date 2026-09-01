import { describe, expect, it } from 'vitest';
import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';
import { getEnv } from '@/config/env';
import { TOOL_DECLARATIONS } from '@/domain/agent/tools';

describe('live smoke - Chat history round-trip', () => {
  it("Chat's own history capture (no manual echo) survives a function-call round-trip", async () => {
    const client = new GoogleGenAI({ apiKey: getEnv().GOOGLE_GENERATIVE_AI_API_KEY });
    const chat = client.chats.create({
      model: getEnv().GOOGLE_GENERATIVE_AI_MODEL,
      config: {
        tools: [{ functionDeclarations: TOOL_DECLARATIONS as never }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
      },
    });

    const first = await chat.sendMessage({ message: 'What is the expansion score for KBOS?' });
    const firstCall = first.functionCalls?.[0];
    if (!firstCall) throw new Error('ANY mode did not force a function call on the first turn');

    const second = await chat.sendMessage({
      message: [{ functionResponse: { name: firstCall.name ?? 'score_airports', response: { scores: [] } } }],
    });

    expect(second.functionCalls?.length).toBeGreaterThan(0);
  });
});
