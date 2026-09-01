import type { Chat } from '@google/genai';

const TTL_MS = 30 * 60 * 1000;

const sessions = new Map<string, { chat: Chat; expiresAt: number }>();

export function getOrCreateChat(sessionId: string, createChat: () => Chat): Chat {
  const existing = sessions.get(sessionId);
  if (existing && existing.expiresAt > Date.now()) {
    existing.expiresAt = Date.now() + TTL_MS;
    return existing.chat;
  }

  const chat = createChat();
  sessions.set(sessionId, { chat, expiresAt: Date.now() + TTL_MS });
  return chat;
}
