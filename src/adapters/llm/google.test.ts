import { describe, expect, it, vi, beforeEach } from 'vitest';

const { chatsCreateMock, sendMessageMock } = vi.hoisted(() => ({
  chatsCreateMock: vi.fn(),
  sendMessageMock: vi.fn(),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    chats = { create: chatsCreateMock };
  },
  FunctionCallingConfigMode: { AUTO: 'AUTO' },
}));

vi.mock('@/domain/agent/tools', () => ({
  TOOL_DECLARATIONS: [{ name: 'resolve_region' }, { name: 'score_airports' }],
  TOOL_HANDLERS: {
    resolve_region: vi.fn(),
    score_airports: vi.fn(),
  },
}));

import { runAgent } from './google';
import { TOOL_HANDLERS } from '@/domain/agent/tools';

function turn(calls: { name: string; args: unknown; id: string }[], text = '') {
  return { functionCalls: calls, text };
}

describe('runAgent', () => {
  beforeEach(() => {
    chatsCreateMock.mockReset();
    sendMessageMock.mockReset();
    chatsCreateMock.mockImplementation(() => ({ sendMessage: sendMessageMock }));
    vi.mocked(TOOL_HANDLERS.resolve_region).mockReset();
    vi.mocked(TOOL_HANDLERS.score_airports).mockReset();
  });

  it('chains resolve_region into score_airports, then returns the agent\'s own final text', async () => {
    vi.mocked(TOOL_HANDLERS.resolve_region).mockResolvedValue({ icaos: ['KBOS', 'KBDL'] });
    vi.mocked(TOOL_HANDLERS.score_airports).mockResolvedValue({
      scores: [
        { icao: 'KBOS', score: 80 },
        { icao: 'KBDL', score: 40 },
      ],
    });

    sendMessageMock
      .mockResolvedValueOnce(turn([{ name: 'resolve_region', args: { region: 'new england' }, id: '1' }]))
      .mockResolvedValueOnce(turn([{ name: 'score_airports', args: { icaos: ['KBOS', 'KBDL'] }, id: '2' }]))
      .mockResolvedValueOnce(turn([], 'KBOS scores highest at 80, ahead of KBDL at 40.'));

    const result = await runAgent('test-session-1', 'Which New England airports are strong candidates?');

    expect(result).toBe('KBOS scores highest at 80, ahead of KBDL at 40.');
    expect(TOOL_HANDLERS.resolve_region).toHaveBeenCalledWith({ region: 'new england' });
    expect(TOOL_HANDLERS.score_airports).toHaveBeenCalledWith({ icaos: ['KBOS', 'KBDL'] });

    expect(sendMessageMock).toHaveBeenNthCalledWith(1, {
      message: 'Which New England airports are strong candidates?',
    });
    expect(sendMessageMock).toHaveBeenNthCalledWith(2, {
      message: [{ functionResponse: { name: 'resolve_region', response: { icaos: ['KBOS', 'KBDL'] } } }],
    });
    expect(sendMessageMock).toHaveBeenNthCalledWith(3, {
      message: [
        {
          functionResponse: {
            name: 'score_airports',
            response: {
              scores: [
                { icao: 'KBOS', score: 80 },
                { icao: 'KBDL', score: 40 },
              ],
            },
          },
        },
      ],
    });
  });

  it('returns the model\'s own text directly when it never calls a tool', async () => {
    sendMessageMock.mockResolvedValueOnce(turn([], 'Paris is the capital of France.'));

    const result = await runAgent('test-session-2', 'What is the capital of France?');

    expect(result).toBe('Paris is the capital of France.');
    expect(TOOL_HANDLERS.resolve_region).not.toHaveBeenCalled();
    expect(TOOL_HANDLERS.score_airports).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenNthCalledWith(1, { message: 'What is the capital of France?' });
  });

  it('falls back to a plain message if the tool-round cap is hit without a final answer', async () => {
    vi.mocked(TOOL_HANDLERS.score_airports).mockResolvedValue({ scores: [{ icao: 'KBOS', score: 80 }] });
    sendMessageMock.mockResolvedValue(turn([{ name: 'score_airports', args: { icaos: ['KBOS'] }, id: '1' }]));

    const result = await runAgent('test-session-3', 'Compare KBOS forever');

    expect(result).toBe("I wasn't able to finish that request - please try rephrasing it.");
    expect(sendMessageMock).toHaveBeenNthCalledWith(1, { message: 'Compare KBOS forever' });
    expect(sendMessageMock).toHaveBeenNthCalledWith(2, {
      message: [{ functionResponse: { name: 'score_airports', response: { scores: [{ icao: 'KBOS', score: 80 }] } } }],
    });
  });

  it('reuses the same Chat for repeated calls with the same sessionId, and creates a new Chat for a different sessionId', async () => {
    sendMessageMock.mockResolvedValue(turn([], 'ok'));

    await runAgent('shared-session', 'hello');
    await runAgent('shared-session', 'hello again');
    expect(chatsCreateMock).toHaveBeenCalledTimes(1);

    await runAgent('other-session', 'hi');
    expect(chatsCreateMock).toHaveBeenCalledTimes(2);
  });
});
