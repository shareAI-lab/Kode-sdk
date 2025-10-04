# Kode SDK v1.5.1

Event-driven Agent Model Client SDK for building long-running, collaborative AI agents.

## Vision

Transform the experience of collaborating with colleagues into a minimal yet sufficient API for **sending messages, giving instructions, interrupting, forking, and resuming** with long-running online Agents.

## Features

- **Event-Driven First**: Subscribe to data plane events (text/tools/usage), control plane callbacks (approvals/hooks)
- **Multi-Agent Ready**: Long-running independent agents with colleague-style collaboration
- **Strong Recovery**: 7-type breakpoint recovery; seals without inserting system text; defaults to READY state
- **Forkable**: Safe-Fork-Points (SFP) naturally exist at tool results and text-only assistant messages
- **Tool Safety**: Denial doesn't throw exceptions; rejected tool results are logged and auditable
- **High Performance**: Concurrent tool execution (rate-limited), streaming model completion, incremental events (cursor/since)
- **Extensible**: MCP tools, Sandbox drivers, Provider adapters, Store backends, Scheduler DSL

## Quick Start

```bash
npm install kode-sdk
```

```typescript
import { Agent, JSONStore, LocalSandbox, AnthropicProvider, builtin } from 'kode-sdk';

const agent = new Agent({
  sessionId: 'agent:assistant/session:demo',
  provider: new AnthropicProvider(process.env.ANTHROPIC_API_KEY),
  store: new JSONStore('./data'),
  sandbox: LocalSandbox.local({ workDir: './workspace' }),
  tools: [...builtin.fs({ workDir: './workspace' }), ...builtin.bash()],
  system: 'You are a helpful assistant.',
});

// Send message
await agent.send('Please list all files in the workspace');

// Subscribe to events
for await (const event of agent.subscribe()) {
  if (event.type === 'text') {
    console.log('Agent:', event.text);
  }
  if (event.type === 'state' && event.state === 'READY') {
    break;
  }
}
```

## Core Concepts

### 1. Agent States

- **READY**: Waiting for user input
- **BUSY**: Processing request or executing tools
- **PAUSED**: Waiting for permission approval

### 2. Safe-Fork-Points (SFP)

SFPs are created when:
- Tool results are written (`tool_result` blocks)
- Assistant provides text-only response (no tools)

Use SFPs to:
- Fork sessions at safe states
- Create bookmarks for rollback
- Branch conversations

### 3. Event System

**MINIMAL Event Kinds** (default subscription):
- `text_chunk`: Streaming text delta
- `text`: Complete text content
- `tool_use`: Tool invocation
- `tool_result`: Tool execution result
- `usage`: Token/cost metrics
- `error`: Typed errors
- `messages_update`: Message history changed

**Additional Events** (opt-in):
- `state`: Agent state changes
- `commit`: SFP created
- `permission_ask`: Approval required
- `permission_decision`: Approval result
- `resume`: Recovery from crash
- `forked`: New session created

### 4. Hooks

Intercept and modify tool execution:

```typescript
agent.use({
  preToolUse(call, ctx) {
    // Validate, modify args, or deny
    if (!ctx.sandbox.fs.isInside(call.args.file)) {
      return { decision: 'deny', reason: 'path out of sandbox' };
    }
    // Request approval
    return { decision: 'ask', meta: { title: 'File Access', path: call.args.file } };
  },

  postToolUse(outcome, ctx) {
    // Trim large results
    if (String(outcome.content).length > 100_000) {
      const path = ctx.sandbox.fs.temp(`tool-${outcome.id}.log`);
      ctx.sandbox.fs.write(path, outcome.content);
      return { update: { content: `[Full output at ./${path}]` } };
    }
  },
});
```

### 5. Scheduler

Time-based and step-based triggers:

```typescript
agent.schedule()
  .every('10m', () => agent.send('Status check'))
  .everySteps(20, () => agent.send('Reminder: review security guidelines'))
  .daily('09:00', () => agent.send('Daily report'))
  .weekly('Mon 09:00', () => agent.send('Weekly summary'));
```

### 6. AgentPool

Manage multiple agent instances:

```typescript
const pool = new AgentPool({
  store: new JSONStore('./data'),
  maxAgents: 50,
});

const agent = pool.create(sessionId, template, options);
const existing = pool.get(sessionId);
const agents = pool.list({ prefix: 'org:acme/' });
```

### 7. Room (Group Chat)

Multi-agent collaboration:

```typescript
const room = new Room(pool);
room.join('alice', 'agent:pm/session:alice');
room.join('bob', 'agent:dev/session:bob');

// Direct mention
await room.say('alice', '@bob Please review the PR');

// Broadcast (excludes sender)
await room.say('alice', 'Meeting at 3pm');
```

## Built-in Tools

### File System

```typescript
builtin.fs({ base: './workspace' })
```

- `Fs.Read`: Read file contents
- `Fs.Write`: Write/create files
- `Fs.Edit`: Replace text in files

### Bash Commands

```typescript
builtin.bash({
  allow: [/^git /, /^npm /],
  block: [/rm -rf/, /sudo/],
  approval: true,
})
```

- `Bash.Run`: Execute commands (foreground/background)
- `Bash.Logs`: Get output from background shell
- `Bash.Kill`: Terminate background shell

### Task Delegation

```typescript
builtin.task({ subAgents: [FrontendAssistant, BackendAssistant] })
```

- `Task.Run`: Delegate work to specialized sub-agents

## API Reference

### Agent

```typescript
// Send message (non-blocking)
send(text: string): Promise<string>

// Subscribe to events
subscribe(opts?: { since?: number; kinds?: AgentEventKind[] }): AsyncIterable<AgentEvent>

// Convenience: send + subscribe
chat(text: string): AsyncIterable<AgentEvent>

// Blocking: wait for complete response
reply(text: string): Promise<string>

// One-off LLM query
askLLM(text: string, opts?): Promise<{ text: string; sessionId: string }>

// Control
interrupt(reason?: string): Promise<void>
decide(permId: string, decision: 'allow' | 'deny', note?: string): Promise<void>

// Snapshot & Fork
snapshot(label?: string): Promise<SnapshotId>
fork(sel?: SnapshotId | { at?: string }): Agent

// Introspection
status(): Promise<AgentStatus>
info(): Promise<AgentInfo>
history(opts?: { since?: number; limit?: number }): Promise<AgentEvent[]>

// Extension
use(hooks: Hooks): this
getHooks(): ReadonlyArray<RegisteredHook>
registerTools(tools: Tool[]): this
schedule(): AgentSchedulerHandle
on(event: 'permission_ask' | 'error' | 'messages_update', handler: Function): this
```

## Session ID Format

```
[org:{orgId}/][team:{teamId}/][user:{userId}/]agent:{template}/session:{rootId}[/fork:{forkId}]*
```

Examples:
- `agent:assistant/session:abc123`
- `org:acme/team:eng/user:42/agent:pm/session:xyz789`
- `agent:dev/session:main/fork:branch1/fork:branch2`

Snapshots:
- `{sessionId}@sfp:{index}`
- `{sessionId}@label:{slug}`

## Examples

See `examples/` directory:

- **U1**: Next.js backend (send + subscribe via SSE)
- **U2**: Permission approval flow
- **U3**: Hook for path guard and result trimming
- **U4**: Scheduler with time and step triggers
- **U5**: Sub-agent task delegation
- **U6**: Room group chat
- **U7**: ChatDev team collaboration

## Architecture

```
Core
 ├─ Agent          (推进引擎；事件管道；SFP 记录；Hook 执行)
 ├─ Events         (cursor/since；增量持久)
 ├─ Scheduler      (时间与 Steps 触发)
 ├─ Hooks          (pre/post tool；pre/post model)
 └─ API            (send/subscribe/chat/reply/askLLM/interrupt/decide/snapshot/fork/resume)

Infra
 ├─ Providers      (Anthropic 直通；其余适配)
 ├─ Sandbox        (local/docker/k8s/remote/vfs)
 ├─ Store          (json/sqlite/postgres)
 ├─ Tools          (内置 FS/Bash/Task；MCP 适配)
 └─ Pool           (实例容器；限额；显式 resume)
```

## Design Philosophy

### Event-Driven First

Default push **MINIMAL events only**. Other events require explicit opt-in via `kinds` parameter.

This forces event-driven patterns and prevents "chaotic operations" on subscription interfaces.

### Tool Safety

Denial doesn't throw exceptions. Instead:
- Returns `tool_result` with `ok: false`
- Content explains reason for denial
- Fully auditable trail

### Strong Recovery

7 breakpoint types (A-G):
- A: Before model request
- B: After model gives tool_use, before approval
- C: During approval wait
- D: In preToolUse hook
- E: During tool execution
- F: In postToolUse hook
- G: During streaming response

All recover by sealing incomplete operations (no system text injection) and returning to READY state.

## Contributing

Contributions welcome! Please see PRD and TDD in `Kode_SDK_v1.5.1.md` for detailed specifications.

## License

MIT
