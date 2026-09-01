import { GoogleGenAI, FunctionCallingConfigMode, type Chat } from '@google/genai';
import { getEnv } from '@/config/env';
import { TOOL_DECLARATIONS, TOOL_HANDLERS, type ToolName } from '@/domain/agent/tools';
import { getOrCreateChat } from './sessionStore';

const MAX_TOOL_ROUNDS = 4;

export const SYSTEM_PROMPT =
  'You are an airport investment analyst assistant. For any question about specific airports or US regions, use the provided tools to resolve airport codes and compute scores - never invent scores, KPI numbers, or airport data yourself; only state numbers that came from a tool result. ' +
  "For any airport-specific answer, state the data window used (a tool result's window field) and which figures are measured versus proxied (a tool result's measuredVsProxied field). " +
  'When answering a long-haul-flight-share question, call flight_destinations and state the long-haul distance threshold you use, explicitly labeling the long-haul/short-haul classification as your own estimate, not a code-computed value. ' +
  "When answering a why-does-this-airport-have-unmet-demand question, call runway_conditions and explicitly label any runway-separation or grouping judgment as your own estimate from the provided coordinates, not a code-computed value, cross-referenced against the result's delayEvents. " +
  'If the question does not name or imply any airport or US region, answer directly without calling any tool.';

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
