# Playbooks：典型场景脚本

本页从实践角度拆解四个最常见的使用场景，给出心智地图、关键 API、示例文件以及注意事项。示例代码位于 `examples/` 目录，可直接 `ts-node` 运行。

---

## 1. 协作收件箱（事件驱动 UI）

- **目标**：持续运行的单 Agent，UI 通过 Progress 流展示文本/工具进度，Monitor 做轻量告警。
- **示例**：`examples/01-agent-inbox.ts`
- **如何运行**：`npm run example:agent-inbox`
- **关键步骤**：
  1. `Agent.create` + `agent.subscribe(['progress'])` 推送文本增量。
  2. 使用 `bookmark` / `cursor` 做断点续播。
  3. `agent.on('tool_executed')` / `agent.on('error')` 将治理事件写入日志或监控。
  4. `agent.todoManager` 自动提醒，UI 可展示 Todo 面板。
- **注意事项**：
  - 建议将 Progress 流通过 SSE/WebSocket 暴露给前端。
  - 若 UI 需要思考过程，可在模板 metadata 中开启 `exposeThinking`。

---

## 2. 工具审批 & 治理

- **目标**：对敏感工具（如 `bash_run`、数据库写入）进行审批；结合 Hook 实现策略守卫。
- **示例**：`examples/02-approval-control.ts`
- **如何运行**：`npm run example:approval`
- **关键步骤**：
  1. 模板中配置 `permission`（如 `mode: 'approval'` + `requireApprovalTools`）。
  2. 订阅 `agent.on('permission_required')`，将审批任务推送到业务系统。
  3. 审批 UI 调用 `agent.decide(id, 'allow' | 'deny', note)`。
  4. 结合 `HookManager` 的 `preToolUse` / `postToolUse` 做更细粒度的策略（如路径守卫、结果截断）。
- **注意事项**：
  - 审批过程中 Agent 处于 `AWAITING_APPROVAL` 断点，恢复后需调用 `ensureProcessing`（SDK 自动处理）。
  - 拒绝工具会自动写入 `tool_result`，UI 可以提示用户重试策略。

---

## 3. 多 Agent 小组协作

- **目标**：一个 Planner 调度多个 Specialist，所有 Agent 长驻且可随时分叉。
- **示例**：`examples/03-room-collab.ts`
- **如何运行**：`npm run example:room`
- **关键步骤**：
  1. 使用单例 `AgentPool` 管理 Agent 生命周期（`create` / `resume` / `fork`）。
  2. 通过 `Room` 实现广播/点名消息；消息带 `[from:name]` 模式进行协作。
  3. 子 Agent 通过 `task_run` 工具或显式 `pool.create` 拉起。
  4. 利用 `agent.snapshot()` + `agent.fork()` 在 Safe-Fork-Point 分叉出新任务。
- **注意事项**：
  - 模板的 `runtime.subagents` 可限制可分派模板与深度。
  - 需要持久化 lineage（SDK 默认写入 metadata），便于审计和回放。
  - 如果不希望监控不存在的文件，可以在模板中关闭 `watchFiles`（示例已设置）。

---

## 4. 调度与系统提醒

- **目标**：让 Agent 在长时运行中定期执行任务、监控文件变更、发送系统提醒。
- **示例**：`examples/04-scheduler-watch.ts`
- **如何运行**：`npm run example:scheduler`
- **关键步骤**：
  1. `const scheduler = agent.schedule(); scheduler.everySteps(N, callback)` 注册步数触发。
  2. 使用 `agent.remind(text, options)` 发送系统级提醒（走 Monitor，不污染 Progress）。
  3. FilePool 默认会监听写入文件，`monitor.file_changed` 触发后可结合 `scheduler.notifyExternalTrigger` 做自动响应。
  4. Todo 结合 `remindIntervalSteps` 做定期回顾。
- **注意事项**：
  - 调度任务应保持幂等，遵循事件驱动思想。
  - 对高频任务可结合外部 Cron，在触发时调用 `scheduler.notifyExternalTrigger`。

---

## 5. 组合拳：审批 + 协作 + 调度

- **场景**：代码审查机器人，Planner 负责拆分任务并分配到不同 Specialist，工具操作需审批，定时提醒确保 SLA。
- **实现路径**：
  1. Planner 模板：具备 `task_run` 工具与调度 Hook，每日早晨自动巡检。
  2. Specialist 模板：聚焦 `fs_*` + `todo_*` 工具，审批策略只对 `bash_run` 开启。
  3. 统一的审批服务：监听全部 Agent 的 Control 事件，打通企业 IM / 审批流。
  4. Room 协作：Planner 将任务以 `@executor` 形式投递，执行完成再 @planner 汇报。
  5. SLA 监控：Monitor 事件进入 observability pipeline（Prometheus / ELK / Datadog）。
  6. 调度提醒：使用 Scheduler 定期检查待办或外部系统信号。

---

## 常用组合 API 速查

- 事件：`agent.subscribe(['progress'])`、`agent.on('error', handler)`、`agent.on('tool_executed', handler)`
- 审批：`permission_required` → `event.respond()` / `agent.decide()`
- 多 Agent：`new AgentPool({ dependencies, maxAgents })`、`const room = new Room(pool)`
- 分叉：`const snapshot = await agent.snapshot(); const fork = await agent.fork(snapshot);`
- 调度：`agent.schedule().everySteps(10, ...)`、`scheduler.notifyExternalTrigger(...)`
- Todo：`agent.getTodos()` / `agent.setTodos()` / `todo_read` / `todo_write`

结合这些 playbook，可以快速落地从“单人助手”到“多人团队协作”的完整产品体验。
