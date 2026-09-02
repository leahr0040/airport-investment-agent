import { GoogleGenAI, FunctionCallingConfigMode, type Chat, type FunctionCall } from '@google/genai';
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

async function executeToolCall(call: FunctionCall): Promise<{ functionResponse: { name: string; response: Record<string, unknown> } }> {
  if (!isToolName(call.name)) {
    return { functionResponse: { name: call.name ?? 'unknown', response: { error: 'unknown_tool' } } };
  }
  let result: unknown;
  try {
    result = await TOOL_HANDLERS[call.name](call.args as never);
  } catch (e) {
    console.error('[llm/google] tool execution failed', call.name, e);
    result = { error: 'tool_execution_failed' };
  }
  return { functionResponse: { name: call.name, response: result as Record<string, unknown> } };
}

function createChat(): Chat {
  return geminiClient.chats.create({
    model: AGENT_MODEL,
    config: { systemInstruction: SYSTEM_PROMPT, tools: AGENT_TOOLS, toolConfig: TOOL_CALLING_CONFIG },
  });
}

const modelIsDone = (response: Awaited<ReturnType<Chat['sendMessage']>>) => !response.functionCalls?.length;

export async function runAgent(sessionId: string, query: string): Promise<string> {
  const chat = getOrCreateChat(sessionId, createChat);
  let response = await chat.sendMessage({ message: query });

  for (let round = 0; round < MAX_TOOL_ROUNDS - 1 && !modelIsDone(response); round++) {
    const parts = await Promise.all(response.functionCalls!.map(executeToolCall));
    response = await chat.sendMessage({ message: parts });
  }

  return modelIsDone(response)
    ? response.text ?? ''
    : "I wasn't able to finish that request - please try rephrasing it.";
}
