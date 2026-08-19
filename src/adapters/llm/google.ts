import { GoogleGenAI, FunctionCallingConfigMode, type Chat } from '@google/genai';
import { getEnv } from '@/config/env';
import { TOOL_DECLARATIONS, TOOL_HANDLERS, type ToolName } from '@/domain/agent/tools';
import { getOrCreateChat } from './sessionStore';

// Caps Gemini round-trips per user query - a multi-tool chain (resolve_region then
// score_airports) normally finishes in 2-3 rounds; this is a runaway-cost backstop.
const MAX_TOOL_ROUNDS = 4;

const SYSTEM_PROMPT =
  'You are an airport investment analyst assistant. For any question about specific airports or US regions, use the provided tools to resolve airport codes and compute scores - never invent scores, KPI numbers, or airport data yourself; only state numbers that came from a tool result. If the question does not name or imply any airport or US region, answer directly without calling any tool.';

// Everything below is constructed once per server instance, not per request (see
// instrumentation.ts) - these are shared, built-once config values (client, model, tools),
// while session-scoped conversation continuity lives in sessionStore.ts, keyed by sessionId.
const geminiClient = new GoogleGenAI({ apiKey: getEnv().GOOGLE_GENERATIVE_AI_API_KEY });
const AGENT_MODEL = getEnv().GOOGLE_GENERATIVE_AI_MODEL;
const AGENT_TOOLS = [{ functionDeclarations: TOOL_DECLARATIONS as never }];
const TOOL_CALLING_CONFIG = { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } };

const TOOL_NAMES = new Set(TOOL_DECLARATIONS.map((t) => t.name));
function isToolName(name: string | undefined): name is ToolName {
  return name !== undefined && TOOL_NAMES.has(name as ToolName);
}

function createChat(): Chat {
  return geminiClient.chats.create({
    model: AGENT_MODEL,
    config: { systemInstruction: SYSTEM_PROMPT, tools: AGENT_TOOLS, toolConfig: TOOL_CALLING_CONFIG },
  });
}

// Chat's own history capture replaces the manual contents array because it already
// preserves whatever per-turn state Gemini requires across tool-call rounds, verified
// live in live.smoke.ts, and it is what makes session-scoped memory possible without
// re-deriving history on every call.
// The agent picks which tool(s) to call and writes the final answer itself - this
// function only executes whatever it decides and returns its own response text.
export async function runAgent(sessionId: string, query: string): Promise<string> {
  const chat = getOrCreateChat(sessionId, createChat);
  let message: Parameters<Chat['sendMessage']>[0]['message'] = query;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await chat.sendMessage({ message });

    const calls = response.functionCalls ?? [];
    if (calls.length === 0) return response.text ?? '';

    const responseParts = [];
    for (const call of calls) {
      if (!isToolName(call.name)) {
        responseParts.push({ functionResponse: { name: call.name ?? 'unknown', response: { error: 'unknown_tool' } } });
        continue;
      }
      const result = await TOOL_HANDLERS[call.name](call.args as never);
      responseParts.push({ functionResponse: { name: call.name, response: result as Record<string, unknown> } });
    }
    message = responseParts;
  }

  return "I wasn't able to finish that request - please try rephrasing it.";
}
