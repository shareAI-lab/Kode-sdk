# Quickstart：10 分钟搭建事件驱动 Agent 收件箱

本文演示如何快速完成从“依赖启动 → Agent 创建 → 事件推送 → 审批回调 → Resume”的闭环。示例使用 Node.js + Express，但同样适用于 Next.js、Fastify、NestJS 等框架。

> 所有代码均基于 `@kode/sdk` v2.7。目录结构与示例可参考 `examples/01-agent-inbox.ts` 与 `examples/nextjs-api-route.ts`。

> **环境变量**：示例默认直连 Anthropic。请预先设置 `ANTHROPIC_API_KEY`（或 `ANTHROPIC_API_TOKEN`），可选配置 `ANTHROPIC_BASE_URL` 与 `ANTHROPIC_MODEL_ID`（默认 `claude-sonnet-4.5-20250929`）。缺失密钥时示例会直接报错，防止误用 Mock 数据。

---

## 1. 初始化依赖容器

```typescript
// bootstrap/runtime.ts
import { createRuntime } from '../examples/shared/runtime';

const modelId = process.env.ANTHROPIC_MODEL_ID ?? 'claude-sonnet-4.5-20250929';

export const deps = createRuntime(({ templates, registerBuiltin }) => {
  registerBuiltin('fs', 'bash', 'todo');

  templates.register({
    id: 'repo-assistant',
    systemPrompt: 'You are the repo teammate. Always reason step-by-step.',
    tools: ['fs_read', 'fs_write', 'fs_edit', 'bash_run', 'todo_read', 'todo_write'],
    model: modelId,
    runtime: {
      todo: { enabled: true, reminderOnStart: true, remindIntervalSteps: 20 },
      metadata: { exposeThinking: false },
    },
  });
});
```

`createRuntime` 会自动注入 JSONStore、SandboxFactory、ToolRegistry，并使用 `.env` 中的 Anthropic 配置构建模型 Provider。
> 提示：该 helper 示例位于仓库的 `examples/shared/runtime.ts`，可复制到你的项目中使用。

---

## 2. Resume or Create Agent

```typescript
// bootstrap/agents.ts
import { Agent, AgentConfig } from '@kode/sdk';
import { createDependencies } from './dependencies';

const templateId = 'repo-assistant';

export async function resumeOrCreate(agentId: string, overrides?: Partial<AgentConfig>) {
  const exists = await deps.store.exists(agentId);
  if (exists) {
    return Agent.resumeFromStore(agentId, deps, { overrides });
  }

  const base: AgentConfig = {
    agentId,
    templateId,
    sandbox: { kind: 'local', workDir: './workspace', enforceBoundary: true },
  };

  return Agent.create({ ...base, ...overrides }, deps);
}
```

---

## 3. Progress → 前端（SSE/WebSocket）

```typescript
// api/agents/[id]/stream.ts (Express 版本)
import express from 'express';
import { resumeOrCreate } from '../bootstrap/agents';

export const router = express.Router();

router.get('/:agentId/stream', async (req, res) => {
  const agentId = req.params.agentId;
  const agent = await resumeOrCreate(agentId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  const iterator = agent.subscribe(['progress', 'monitor'], {
    since: req.query.since ? { seq: Number(req.query.since), timestamp: Date.now() } : undefined,
  })[Symbol.asyncIterator]();

  (async () => {
    for await (const envelope of { [Symbol.asyncIterator]: () => iterator }) {
      res.write(`data: ${JSON.stringify(envelope)}\n\n`);
    }
  })().catch((error) => {
    console.error('stream error', error);
    res.end();
  });
});
```

前端即可用 `EventSource` / `WebSocket` 订阅数据面事件。

---

## 4. Control → 审批服务

```typescript
// api/agents/[id]/control.ts
router.post('/:agentId/decision', async (req, res) => {
  const { agentId } = req.params;
  const { callId, decision, note } = req.body; // 由审批 UI 提交

  const agent = await resumeOrCreate(agentId);
  await agent.decide(callId, decision, note);

  res.status(204).end();
});

async function bindControl(agent: Agent) {
  agent.on('permission_required', (event) => {
    // 推送到审批系统（webhook/bus），或写入数据库待审批
    enqueueApprovalTask({
      agentId: agent.agentId,
      callId: event.call.id,
      tool: event.call.name,
      inputPreview: event.call.inputPreview,
      note: event.respond.toString(),
    });
  });
}
```

`permission_required` 回调只会在必要时触发，配合策略/Hook 可细化审批逻辑。

---

## 5. 发送消息 & 断点续播

```typescript
router.post('/:agentId/messages', async (req, res) => {
  const { agentId } = req.params;
  const { text } = req.body;

  const agent = await resumeOrCreate(agentId);
  await agent.send(text);

  res.status(202).json({ status: 'queued' });
});

// Progress 流中的 `bookmark` 可写入数据库，前端断线后携带 ?since=cursor 续播。
```

---

## 6. Monitor → 告警/审计

```typescript
async function bindMonitor(agent: Agent) {
  agent.on('error', (event) => {
    logger.warn({ agentId: agent.agentId, phase: event.phase, detail: event.detail }, 'agent error');
  });

  agent.on('tool_executed', (event) => {
    auditStore.write({
      agentId: agent.agentId,
      tool: event.call.name,
      durationMs: event.call.durationMs,
      approval: event.call.approval,
    });
  });
}
```

Monitor 事件只在必要时推送，日志/告警系统可以聚合这些事件。

---

## 7. Resume / Fork

- 服务重启或实例迁移时，通过 `Agent.resumeFromStore` 恢复。
- 如果希望“分叉”出新任务，调用 `agent.snapshot()` → `agent.fork()`，新的 Agent 会继承工具配置与 lineage。
- `monitor.agent_resumed` 事件会告知自动封口的工具列表，可用于报表或人工确认。

```typescript
const forked = await agent.fork();
await forked.send('这是分叉后的新任务，请从 snapshot 接着处理。');
```

---

## 8. 测试建议

- 使用 `MockModelProvider`（自定义）或 `AnthropicProvider` 的测试 key 做集成测试。
- 针对审批流程模拟 `permission_required` → `decide` 的正反用例。
- 断线重连：模拟 SSE 中断后继续携带 `since`。
- 恢复测试：`snapshot → Agent.resumeFromStore → agent.status()`，确认断点与工具记录完整。

---

## 9. 常见问题排查

| 现象 | 排查建议 |
| --- | --- |
| Resume 报模板缺失 | 确认服务启动时已注册模板，并与 metadata 中的 `templateId` 一致。|
| 工具未找到 | ToolRegistry 未注册对应名称。请确保注册工厂返回 `ToolInstance`。|
| 事件流无输出 | 检查是否调用了 `agent.send`；确认前端 SSE 连接未被代理裁剪。|
| 提醒过多 | 调整模板的 `runtime.todo.remindIntervalSteps` 或使用 Hook 抑制提醒。|
| Bash 工具被拒绝 | `LocalSandbox` 默认阻止危险命令，可通过模板 overrides 放宽 `allowPaths` 或自定义 Sandbox。|

---

完成上述步骤，你已经拥有一个“协作收件箱”级别的 Agent 服务。接下来可以继续阅读：

- [`docs/playbooks.md`](./playbooks.md)：针对审批、团队协作、调度的进阶脚本。
- [`docs/events.md`](./events.md)：三通道事件流的心智模型与最佳实践。
- [`docs/tools.md`](./tools.md)：如何扩展自定义工具、接入 MCP。
