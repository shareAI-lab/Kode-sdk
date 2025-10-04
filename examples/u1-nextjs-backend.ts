// Example U1: Next.js Backend - Send + Subscribe

import { AgentPool, Agent, JSONStore, LocalSandbox, AnthropicProvider, builtin } from '../src';

const pool = new AgentPool({
  store: new JSONStore('./data'),
  maxAgents: 50,
});

const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || '');

// POST /api/send
export async function handleSend(req: { sid: string; text: string }) {
  const { sid, text } = req;

  let agent = pool.get(sid);
  if (!agent) {
    agent = pool.create(sid, {
      sessionId: sid,
      provider,
      store: new JSONStore('./data'),
      sandbox: LocalSandbox.local({ workDir: './workspace' }),
      tools: [...builtin.fs({ workDir: './workspace' }), ...builtin.bash()],
      system: 'You are a helpful repository assistant.',
    });
  }

  const mid = await agent.send(text);
  return { mid };
}

// GET /api/events?sid=...&since=...
export async function handleEvents(req: { sid: string; since?: number }) {
  const { sid, since } = req;
  const agent = pool.get(sid);
  if (!agent) throw new Error('Agent not found');

  const kinds = ['text_chunk', 'text', 'tool_use', 'tool_result', 'usage', 'error', 'messages_update'] as const;

  // Return async iterator that can be streamed
  return agent.subscribe({ since, kinds });
}

// Example Next.js API route
// app/api/send/route.ts
/*
export async function POST(req: Request) {
  const body = await req.json();
  const result = await handleSend(body);
  return Response.json(result);
}
*/

// app/api/events/route.ts
/*
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sid = url.searchParams.get('sid')!;
  const since = Number(url.searchParams.get('since') || 0);

  const events = await handleEvents({ sid, since });

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const event of events) {
          controller.enqueue(`data:${JSON.stringify(event)}\n\n`);
        }
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } }
  );
}
*/
