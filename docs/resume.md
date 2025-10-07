# Resume / Fork 指南

长时运行的 Agent 必须具备“随时恢复、可分叉、可审计”的能力。KODE SDK 在内核层实现了统一的持久化协议（消息、工具调用、Todo、事件、断点、Lineage），业务侧只需正确注入依赖并重绑事件即可。

---

## 关键概念

- **Metadata**：`persistInfo()` 会序列化模板、工具描述符、权限、Todo、沙箱配置、上下文策略、断点、lineage 等信息写入 Store。
- **Safe-Fork-Point (SFP)**：每次用户消息或工具结果都会形成可恢复节点，`snapshot`/`fork` 都基于 SFP。
- **BreakpointState**：标记当前执行阶段（`READY` → `PRE_MODEL` → ... → `POST_TOOL`），Resume 时用于自愈与治理事件。
- **Auto-Seal**：当崩溃或中断发生在工具执行阶段，Resume 时会自动封口，落下一条 `tool_result`，并通过 `monitor.agent_resumed` 报告。

---

## Resume 的两种方式

```typescript
import { Agent, AgentConfig } from '@kode/sdk';
import { createDependencies } from '../bootstrap/dependencies';

const deps = createDependencies();

// 方式一：显式配置
const agent = await Agent.resume('agt:demo', {
  templateId: 'repo-assistant',
  modelConfig: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', apiKey: process.env.ANTHROPIC_API_KEY! },
  sandbox: { kind: 'local', workDir: './workspace', enforceBoundary: true },
}, deps, {
  strategy: 'crash',  // 自动封口未完成工具
  autoRun: true,      // 恢复后继续处理队列
});

// 方式二：读取 metadata（推荐）
const agent2 = await Agent.resumeFromStore('agt:demo', deps, {
  overrides: {
    modelConfig: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', apiKey: process.env.ANTHROPIC_API_KEY! },
  },
});
```

- `strategy: 'manual' | 'crash'`：`crash` 会封口未完成工具并触发 `monitor.agent_resumed`。
- `autoRun`：恢复后立即继续处理消息队列。
- `overrides`：对 metadata 进行最小化覆盖（模型升级、权限调整、沙箱迁移等）。

Resume 后**必须**重新绑定事件监听（Control/Monitor 回调不会自动恢复）。

---

## 业务 vs SDK 的职责分界

| 能力 | SDK | 业务方 |
| --- | --- | --- |
| 模板、工具、沙箱恢复 | ✅ 自动重建 | ❌ 无需处理 |
| 消息、工具记录、Todo、Lineage | ✅ 自动加载 | ❌ |
| FilePool 监听 | ✅ 自动恢复（需支持 `sandbox.watchFiles`） | ❌ |
| Hooks | ✅ 自动重新注册 | ❌ |
| Control/Monitor 监听 | ❌ | ✅ Resume 后需重新绑定 |
| 审批流程、告警 | ❌ | ✅ 结合业务系统处理 |
| 依赖单例管理 | ❌ | ✅ 确保 `store` / `registry` 全局复用 |

---

## Safe-Fork-Point 与分叉

```typescript
const bookmarkId = await agent.snapshot('pre-release-audit');
const forked = await agent.fork(bookmarkId);

await forked.send('这是一个基于原对话分叉出的新任务。');
```

- `snapshot(label?)` 返回 `SnapshotId`（默认为 `sfp:{index}`）。
- `fork(sel?)` 创建新 Agent：继承工具/权限配置与 lineage，并把消息复制到新 Store 命名空间。
- 分叉后的 Agent 需要独立绑定事件监听。

---

## 自动封口（Auto-Seal）

当崩溃发生在以下阶段，Resume 会自动写入补偿性的 `tool_result`：

| 阶段 | 封口信息 | 推荐处理 |
| --- | --- | --- |
| `PENDING` | 工具尚未执行 | 验证参数后重新触发工具。|
| `APPROVAL_REQUIRED` | 等待审批 | 再次触发审批或手动完成审批。|
| `APPROVED` | 准备执行 | 确认输入仍然有效后重试。|
| `EXECUTING` | 执行中断 | 检查副作用，必要时人工确认再重试。|

封口会触发：

- `monitor.agent_resumed`：包含 `sealed` 列表与 `strategy`。
- `progress.tool:end`：补上一条失败的 `tool_result`，附带 `recommendations`。

---

## 多实例 / Serverless 环境建议

1. **依赖单例**：在模块级创建 `AgentDependencies`，避免多个实例写入同一 Store 目录。
2. **事件重绑**：每次 `resume` 后立刻调用 `bindProgress/Control/Monitor`。
3. **并发控制**：同一个 AgentId 最好只在单实例中运行，可通过外部锁或队列保证。
4. **持久化目录**：`JSONStore` 适用于单机/有共享磁盘环境。分布式部署请实现自定义 Store（例如 S3 + DynamoDB）。
5. **可观测性**：监听 `monitor.state_changed` 与 `monitor.error`，在异常时迅速定位。

---

## 常见问题排查

| 现象 | 排查方向 |
| --- | --- |
| Resume 报 `AGENT_NOT_FOUND` | Store 目录缺失或未持久化。确认 `store.baseDir` 是否正确挂载。|
| Resume 报 `TEMPLATE_NOT_FOUND` | 启动时未注册模板；确保模板 ID 与 metadata 中一致。|
| 工具缺失 | ToolRegistry 未注册对应名称；内置工具需手动注册。|
| FilePool 未恢复 | 自定义 Sandbox 未实现 `watchFiles`；可关闭 watch 或补齐实现。|
| 事件监听失效 | Resume 后未重新调用 `agent.on(...)` 绑定。|

---

掌握 Resume/Fork 心智后，就可以构建“永不断线”的 Agent 服务：随时恢复、随时分叉、随时审计。
