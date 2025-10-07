# 工具体系与治理

Kode SDK 提供一组内置工具，并允许通过 ToolRegistry 注册自定义/MCP 工具。所有工具在设计上遵循以下规范：

- **Prompt 说明书**：每个工具都提供详细 Prompt，引导模型安全使用。
- **结构化返回**：工具返回 JSON 结构（例如 `fs_read` 返回 `content/offset/limit/truncated`）。
- **FilePool 集成**：文件类工具自动调用 FilePool 校验与记录，防止新鲜度冲突。
- **工具状态审计**：ToolCallRecord 记录审批、耗时、错误信息，Resume 时完整恢复。

> **🆕 v2.7 新增**：简化的工具定义 API，自动生成 Schema、简化 metadata、支持自定义事件。
> 详见 [simplified-tools.md](./simplified-tools.md) 或 `examples/tooling/simplified-tools.ts`

## 文件系统工具

| 名称 | 说明 | 返回字段 |
| --- | --- | --- |
| `fs_read` | 读取文件片段 | `{ path, offset, limit, truncated, content }` |
| `fs_write` | 创建/覆写文件，写前校验新鲜度 | `{ ok, path, bytes, length }` |
| `fs_edit` | 精确替换文本（支持 `replace_all`） | `{ ok, path, replacements, length }` |
| `fs_glob` | 使用 glob 模式匹配文件 | `{ ok, pattern, cwd, matches, truncated }` |
| `fs_grep` | 在文件/通配符集合中搜索文本/正则 | `{ ok, pattern, path, matches[] }` |
| `fs_multi_edit` | 批量编辑多个文件 | `{ ok, results[{ path, status, replacements, message? }] }` |

### FilePool 说明

- `recordRead` / `recordEdit`：记录最近读取/写入时间，用于冲突检测。
- `validateWrite`：写入前校验文件是否在此 Agent 读取后被外部修改。
- `watchFiles`：自动监听文件变更，触发 `monitor.file_changed` 事件，并通过 `agent.remind` 提醒。

## Bash 工具

- `bash_run`：支持前台/后台执行，可通过 Hook 或 `permission.mode='approval'` 控制敏感命令。
- `bash_logs`：读取后台命令输出。
- `bash_kill`：终止后台命令。

### 推荐策略

```typescript
const agent = await Agent.create({
  templateId: 'secure-runner',
  modelConfig: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', apiKey: process.env.ANTHROPIC_API_KEY! },
  sandbox: { kind: 'local', workDir: './workspace', enforceBoundary: true },
  overrides: {
    hooks: {
      preToolUse(call) {
        if (call.name === 'bash_run' && !/^git /.test(call.args.cmd)) {
          return { decision: 'ask', meta: { reason: '非白名单命令' } };
        }
        return undefined;
      },
    },
  },
}, deps);
```

## Todo 工具

- `todo_read`：返回 Todo 列表。
- `todo_write`：写入完整 Todo 列表（校验 ID 唯一、进行中 <=1）。结合 `TodoManager` 自动提醒与事件。

## Task（子代理）

- `task_run`：根据模板池派发子 Agent，支持 `subagent_type`、`context`、`model_name` 参数。
- 模板可以通过 `runtime.subagents` 限制深度与可选模板。

## 工具注册与 resume 支持

```typescript
const registry = new ToolRegistry();

registry.register('greet', () => ({
  name: 'greet',
  description: '向指定对象问好',
  input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  prompt: 'Use this tool to greet teammates by name.',
  async exec(args) {
    return `Hello, ${args.name}!`;
  },
  toDescriptor() {
    return { source: 'registered', name: 'greet', registryId: 'greet' };
  },
}));
```

Resume 会根据 `ToolDescriptor` 自动重建工具；若工具依赖外部资源，请在 `exec` 里自行注入。

## MCP / 自定义驱动

- 可以在 ToolRegistry 注册 MCP loader，将 `registryId` 指向 MCP 服务。
- 配合 TemplateRegistry 指定哪些模板启用 MCP 工具，Resume 时即可正常恢复。

更多示例可参考 `examples/tooling/fs-playground.ts`、`examples/u5-sub-agent.ts`。

## 工具超时与 AbortSignal 最佳实践

### 超时配置

默认工具执行超时为 **60 秒**，可通过 Agent 配置自定义：

```typescript
const agent = await Agent.create({
  // ...
  metadata: {
    toolTimeoutMs: 120000, // 2 分钟
  }
});
```

### 必须处理 AbortSignal

所有自定义工具的 `exec()` 方法都会收到 `context.signal`，**必须**在耗时操作中检查：

```typescript
export class MyLongRunningTool implements ToolInstance {
  async exec(args: any, context: ToolContext) {
    // ✅ 正确：在长时间操作前检查
    if (context.signal?.aborted) {
      throw new Error('Operation aborted');
    }

    // ✅ 正确：将 signal 传递给底层 API
    const response = await fetch(url, { signal: context.signal });

    // ✅ 正确：在循环中定期检查
    for (const item of items) {
      if (context.signal?.aborted) {
        throw new Error('Operation aborted');
      }
      await processItem(item);
    }

    return result;
  }
}
```

**错误示例**（不响应 signal）：

```typescript
// ❌ 错误：忽略 signal，超时后仍会继续执行
export class BadTool implements ToolInstance {
  async exec(args: any, context: ToolContext) {
    // 长时间操作，完全不检查 signal
    for (let i = 0; i < 10000; i++) {
      await heavyComputation();
    }
    return result;
  }
}
```

### 超时事件监听

可以监听工具超时事件以进行告警或降级处理：

```typescript
agent.onMonitor('error', (event) => {
  if (event.phase === 'tool' && event.message.includes('aborted')) {
    console.log('Tool execution timed out:', event.detail);
    // 发送告警、记录日志等
  }
});
```

### CPU 密集型任务的超时处理

对于纯计算任务（无 I/O），需要主动在循环中检查：

```typescript
export class CPUIntensiveTool implements ToolInstance {
  async exec(args: any, context: ToolContext) {
    const result = [];

    for (let i = 0; i < args.iterations; i++) {
      // 每 100 次迭代检查一次 signal
      if (i % 100 === 0 && context.signal?.aborted) {
        throw new Error('Computation aborted');
      }

      result.push(this.compute(i));
    }

    return result;
  }
}
```

### 超时恢复策略

工具超时后，Agent 会：
1. 发送 `abort` 信号
2. 标记工具调用为 `FAILED` 状态
3. 生成 `tool_result` 包含超时信息
4. 继续下一轮 `runStep`

Resume 时，超时的工具调用会被自动封口（Auto-Seal），不会重新执行。

### 测试工具超时

```typescript
// tests/tool-timeout.test.ts
import { Agent } from '@kode/sdk';

const slowTool = {
  name: 'slow_tool',
  description: 'A tool that takes too long',
  input_schema: { type: 'object', properties: {} },
  async exec(args: any, context: ToolContext) {
    // 模拟长时间操作
    await new Promise(resolve => setTimeout(resolve, 180000)); // 3 分钟
    return 'done';
  }
};

// 设置短超时时间进行测试
const agent = await Agent.create({
  // ...
  metadata: { toolTimeoutMs: 5000 }, // 5 秒超时
});

agent.registerTool(slowTool);

// 预期：工具会在 5 秒后超时
const result = await agent.chat('Please use slow_tool');
console.assert(result.status === 'ok'); // Agent 继续运行
```

### 工具超时最佳实践总结

1. ✅ **始终检查 `context.signal?.aborted`**
2. ✅ **将 signal 传递给支持 AbortSignal 的 API（fetch、axios 等）**
3. ✅ **在循环中定期检查（建议每 100 次迭代或每秒）**
4. ✅ **设置合理的超时时间（根据工具复杂度）**
5. ✅ **监听超时事件进行告警**
6. ❌ **不要忽略 signal**
7. ❌ **不要依赖工具内部的超时机制（应由 Agent 统一管理）**
