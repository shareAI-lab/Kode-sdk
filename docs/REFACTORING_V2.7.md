# KODE SDK v2.7 完整重构总结

> **重要**: 本次重构不考虑向后兼容，完全按最佳实践重新设计

## 核心设计原则

1. **职责明确**: 每个模块有清晰的单一职责
2. **接口简洁**: 去除所有可选方法，强制实现完整功能
3. **统一策略**: WAL、事件流、历史管理采用统一的设计模式
4. **可追溯性**: 所有状态变更都有完整的审计轨迹

## 重构完成的模块

### 1. Store 接口重新设计

**设计原则**:
- ❌ 不使用可选方法（`?:`）
- ✅ 明确职责分离
- ✅ 接口不暴露实现细节

**新接口结构**:
```typescript
export interface Store {
  // 运行时状态管理
  saveMessages(agentId: string, messages: Message[]): Promise<void>;
  loadMessages(agentId: string): Promise<Message[]>;
  saveToolCallRecords(agentId: string, records: ToolCallRecord[]): Promise<void>;
  loadToolCallRecords(agentId: string): Promise<ToolCallRecord[]>;
  saveTodos(agentId: string, snapshot: TodoSnapshot): Promise<void>;
  loadTodos(agentId: string): Promise<TodoSnapshot | undefined>;

  // 事件流管理
  appendEvent(agentId: string, timeline: Timeline): Promise<void>;
  readEvents(agentId: string, opts?: { since?: Bookmark; channel?: AgentChannel }): AsyncIterable<Timeline>;

  // 历史与压缩管理
  saveHistoryWindow(agentId: string, window: HistoryWindow): Promise<void>;
  loadHistoryWindows(agentId: string): Promise<HistoryWindow[]>;
  saveCompressionRecord(agentId: string, record: CompressionRecord): Promise<void>;
  loadCompressionRecords(agentId: string): Promise<CompressionRecord[]>;
  saveRecoveredFile(agentId: string, file: RecoveredFile): Promise<void>;
  loadRecoveredFiles(agentId: string): Promise<RecoveredFile[]>;

  // 快照管理
  saveSnapshot(agentId: string, snapshot: Snapshot): Promise<void>;
  loadSnapshot(agentId: string, snapshotId: string): Promise<Snapshot | undefined>;
  listSnapshots(agentId: string): Promise<Snapshot[]>;

  // 元数据管理
  saveInfo(agentId: string, info: AgentInfo): Promise<void>;
  loadInfo(agentId: string): Promise<AgentInfo | undefined>;

  // 生命周期管理
  exists(agentId: string): Promise<boolean>;
  delete(agentId: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}
```

### 2. JSONStore 统一 WAL 策略

**新目录结构**:
```
{baseDir}/{agentId}/
├── runtime/              # 运行时状态（带 WAL 保护）
│   ├── messages.json
│   ├── messages.wal
│   ├── tool-calls.json
│   ├── tool-calls.wal
│   └── todos.json
├── events/              # 事件流（按通道分离，带 WAL）
│   ├── progress.log
│   ├── progress.wal
│   ├── control.log
│   ├── control.wal
│   ├── monitor.log
│   └── monitor.wal
├── history/             # 历史归档
│   ├── windows/
│   │   └── {timestamp}.json
│   ├── compressions/
│   │   └── {timestamp}.json
│   └── recovered/
│       └── {filename}_{timestamp}.txt
├── snapshots/           # 快照
│   └── {snapshotId}.json
└── meta.json           # 元信息
```

**WAL 策略**:
1. **写入流程**: WAL → 主文件（tmp + rename）→ 删除 WAL
2. **恢复流程**: 加载时检查 WAL → 存在则恢复 → 删除 WAL → 读取主文件
3. **统一队列**: 使用 `queueWalWrite` 确保写入顺序

**特性**:
- ✅ 运行时数据全部使用 WAL 保护
- ✅ 事件流按通道分离存储
- ✅ 原子写入（tmp + rename）
- ✅ 崩溃自动恢复

### 3. ContextManager v2

**新功能**:
- ✅ Token-based 压缩（而不是字符数）
- ✅ 保存完整的 HistoryWindow
- ✅ 记录 CompressionRecord
- ✅ 保存重要文件快照（RecoveredFile）
- ✅ 提供历史查询 API

**压缩流程**:
```typescript
async compress(messages: Message[], events: Timeline[], filePool?: FilePoolState) {
  // 1. 保存历史窗口（压缩前的完整快照）
  await store.saveHistoryWindow(agentId, {
    id: windowId,
    messages,
    events,
    stats: { messageCount, tokenCount, eventCount },
    timestamp
  });

  // 2. 执行压缩
  const retainedMessages = messages.slice(-keepCount);
  const summary = generateSummary(removedMessages);

  // 3. 保存压缩记录
  await store.saveCompressionRecord(agentId, {
    id: compressionId,
    windowId,
    config: { model, prompt, threshold },
    summary,
    ratio,
    recoveredFiles,
    timestamp
  });

  // 4. 保存文件快照（如果有）
  if (filePool) {
    for (const file of filePool.getAccessedFiles()) {
      await store.saveRecoveredFile(agentId, file);
    }
  }

  return { summary, removedMessages, retainedMessages, windowId, compressionId, ratio };
}
```

## 数据结构定义

### HistoryWindow
```typescript
interface HistoryWindow {
  id: string;                 // 窗口ID
  messages: Message[];        // 完整消息历史
  events: Timeline[];         // 完整事件历史
  stats: {
    messageCount: number;
    tokenCount: number;
    eventCount: number;
  };
  timestamp: number;
}
```

### CompressionRecord
```typescript
interface CompressionRecord {
  id: string;                 // 压缩记录ID
  windowId: string;           // 关联的窗口ID
  config: {
    model: string;            // 使用的模型
    prompt: string;           // 压缩提示词
    threshold: number;        // 触发阈值
  };
  summary: string;            // 压缩摘要
  ratio: number;              // 压缩比例
  recoveredFiles: string[];   // 恢复的文件路径
  timestamp: number;
}
```

### RecoveredFile
```typescript
interface RecoveredFile {
  path: string;               // 文件路径
  content: string;            // 文件内容快照
  mtime: number;              // 修改时间
  timestamp: number;          // 快照时间
}
```

## 优势对比

### 旧版 vs 新版

| 维度 | 旧版 v1.5.1 | 新版 v2.7 |
|------|-------------|-----------|
| **Store 接口** | 大量可选方法 | 全部必需方法 |
| **WAL 保护** | 仅事件流 | 全部运行时数据 |
| **目录结构** | 扁平混乱 | 清晰分层 |
| **事件存储** | 单一文件 | 按通道分离 |
| **压缩策略** | 简单截断 | 完整历史追踪 |
| **文件恢复** | 不支持 | 完整支持 |
| **审计能力** | 基础 | 完整可追溯 |

### 文件命名规范

**旧版** (混乱):
- `events.jsonl` (所有事件混在一起)
- `window-{id}.json` (ID 不规范)
- `comp-{id}.json` (命名不清晰)
- `{filename}-{timestamp}.txt` (容易冲突)

**新版** (规范):
- `progress.log` / `control.log` / `monitor.log` (按用途分离)
- `{timestamp}.json` (时间戳作为自然排序的文件名)
- `{filename}_{timestamp}.txt` (下划线分隔，避免冲突)

## 迁移指南

### 不兼容变更

1. **Store 接口**
   - 所有可选方法变为必需
   - 自定义 Store 需要实现全部方法

2. **目录结构**
   - 旧版：`{agentId}/events.jsonl`
   - 新版：`{agentId}/events/{channel}.log`

3. **ContextManager API**
   - `compress(messages)` → `compress(messages, events, filePool?)`
   - 返回值增加 `windowId`, `compressionId`, `ratio`

### 数据迁移

如果有旧数据需要迁移：

```typescript
// 迁移脚本示例
async function migrate(oldStore: OldStore, newStore: Store, agentId: string) {
  // 1. 迁移消息和工具记录（目录变更）
  const messages = await oldStore.loadMessages(agentId);
  const toolCalls = await oldStore.loadToolCallRecords(agentId);
  await newStore.saveMessages(agentId, messages);
  await newStore.saveToolCallRecords(agentId, toolCalls);

  // 2. 迁移事件（单文件 → 多通道）
  const events = await oldStore.readEvents(agentId);
  for await (const event of events) {
    await newStore.appendEvent(agentId, event);
  }

  // 3. 旧的 history.jsonl 不再使用，可选迁移到新格式
}
```

## 后续任务

### 待重构模块
1. **Scheduler** - 统一 Step 和 TimeBridge
2. **Permission System** - 序列化和恢复机制
3. **ToolRunner** - 统一控制器管理
4. **Room/Pool/Task** - 协作系统增强

### 文档与测试
1. API 文档完整重写
2. 示例代码更新
3. 单元测试覆盖
4. 集成测试套件

## 总结

v2.7 重构从存储层开始，建立了坚实的基础：

✅ **清晰的职责分离** - Store 接口设计优雅
✅ **统一的 WAL 策略** - 数据安全有保障
✅ **规范的目录结构** - 易于理解和维护
✅ **完整的历史追踪** - 压缩和恢复可审计

这为后续的调度、权限、工具运行时等模块重构提供了坚实的基础。
