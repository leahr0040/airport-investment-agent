'use client';

import { useState } from 'react';

type ChatApiResponse = { ok: true; data: { narrative: string } } | { ok: false; error: { code: string; message: string } };

type ChatMessage = { id: string; role: 'user' | 'agent' | 'error'; text: string };

export default function Home() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: query }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-session-id': sessionId },
        body: JSON.stringify({ query }),
      });
      const body = (await res.json()) as ChatApiResponse;

      const responseId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        body.ok
          ? { id: responseId, role: 'agent', text: body.data.narrative }
          : { id: responseId, role: 'error', text: body.error.message },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'error', text: 'Could not reach the server. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <h1 className="mb-4 text-xl font-semibold">Airport Investment Intelligence Agent</h1>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Ask something like &ldquo;Compare KATL and KSFO for expansion&rdquo;.
          </p>
        )}

        {messages.map((message) => (
          <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={
                'inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ' +
                (message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.role === 'error'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-900')
              }
            >
              {message.text}
            </div>
          </div>
        ))}

        {loading && <p className="text-sm text-gray-500">Thinking…</p>}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Ask about airport expansion candidates…"
          className="flex-1 rounded border px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
