# 错误处理机制

## 核心原则

1. **模型感知错误并自我调整** - 所有错误信息对模型可见且可操作
2. **程序永不崩溃** - 多层错误捕获，确保系统稳定运行  
3. **完整监听记录** - 所有错误触发事件，方便监控和调试

## 错误处理架构

### 错误流转路径

```
工具执行
  ├─ 参数验证失败 → {ok: false, error: ..., _validationError: true}
  ├─ 执行抛异常 → {ok: false, error: ..., _thrownError: true}
  ├─ 返回 {ok: false} → 保持原样（逻辑错误）
  └─ 正常返回 → 保持原样
     ↓
Agent 处理
  ├─ 识别错误类型：validation | runtime | logical | aborted | exception
  ├─ 判断可重试性：validation不可重试，其他可重试
  ├─ 生成智能建议：基于错误类型和工具名称
  ├─ 发出 tool:error 事件（ProgressEvent - 用户可见）
  └─ 发出 error 事件（MonitorEvent - 监控系统）
     ↓
返回给模型
  └─ {
       ok: false,
       error: "具体错误信息",
       errorType: "错误类型",
       retryable: true/false,
       recommendations: ["建议1", "建议2", ...]
     }
```

## 错误类型分类

| 错误类型 | 标识 | 可重试 | 典型场景 |
|---------|------|--------|---------|
| `validation` | `_validationError: true` | ❌ | 参数类型错误、必填参数缺失 |
| `runtime` | `_thrownError: true` | ✅ | 文件不存在、权限不足、网络错误 |
| `logical` | 工具返回 `{ok: false}` | ✅ | 文件内容不匹配、命令执行失败 |
| `aborted` | 超时/中断 | ❌ | 工具执行超时、用户中断 |
| `exception` | 未预期异常 | ✅ | 系统异常、未知错误 |

## 核心实现

### 1. 工具层统一错误处理

`src/tools/tool.ts`

```typescript
async exec(args: any, ctx: ToolContext): Promise<any> {
  try {
    // 参数验证（safeParse 不抛异常）
    if (def.parameters) {
      const parseResult = def.parameters.safeParse(args);
      if (!parseResult.success) {
        return {
          ok: false,
          error: `Invalid parameters: ${parseResult.error.message}`,
          _validationError: true
        };
      }
      args = parseResult.data;
    }

    // 执行工具
    const result = await def.execute(args, enhancedCtx);

    // 保持工具返回的 {ok: false}
    if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
      return result;
    }

    return result;
  } catch (error: any) {
    // 捕获所有异常，统一返回格式
    return {
      ok: false,
      error: error?.message || String(error),
      _thrownError: true
    };
  }
}
```

### 2. Agent层错误识别和处理

`src/core/agent.ts`

```typescript
// 正确识别工具状态
const outputOk = output && typeof output === 'object' && 'ok' in output ? output.ok : true;
let outcome: ToolOutcome = {
  id: toolUse.id,
  name: toolUse.name,
  ok: outputOk !== false,  // 修复了硬编码 ok: true 的问题
  content: output
};

// 处理失败情况
const errorType = errorContent?._validationError ? 'validation' :
                  errorContent?._thrownError ? 'runtime' : 'logical';
const isRetryable = errorType !== 'validation';

// 发出进度事件（用户可见）
this.events.emitProgress({
  channel: 'progress',
  type: 'tool:error',
  call: this.snapshotToolRecord(record.id),
  error: errorMessage,
});

// 发出监控事件（系统级）
this.events.emitMonitor({
  channel: 'monitor',
  type: 'error',
  severity: 'warn',
  phase: 'tool',
  message: errorMessage,
  detail: { ...outcome.content, errorType, retryable: isRetryable },
});

// 返回给模型
return this.makeToolResult(toolUse.id, {
  ok: false,
  error: errorMessage,
  errorType,
  retryable: isRetryable,
  recommendations: this.getErrorRecommendations(errorType, toolUse.name),
});
```

### 3. 智能错误建议

`getErrorRecommendations(errorType, toolName)` 示例：

```typescript
case 'validation':
  return [
    '检查工具参数是否符合schema要求',
    '确认所有必填参数已提供',
    '检查参数类型是否正确',
    '参考工具手册中的参数说明'
  ];

case 'logical':
  if (toolName.startsWith('fs_')) {
    return [
      '确认文件内容是否符合预期',
      '检查文件是否被外部修改',
      '验证路径和模式是否正确',
      '可以先用 fs_read 确认文件状态'
    ];
  }
  // ... 更多针对性建议
```

## 模型自我调整示例

### 场景：文件不存在错误

**工具返回：**
```json
{
  "ok": false,
  "error": "File not found: /src/utils/helper.ts",
  "errorType": "logical",
  "retryable": true,
  "recommendations": [
    "确认文件内容是否符合预期",
    "检查文件是否被外部修改",
    "验证路径和模式是否正确",
    "可以先用 fs_read 确认文件状态"
  ]
}
```

**模型分析：**
1. `errorType: "logical"` - 不是参数问题，是文件确实不存在
2. `retryable: true` - 可以尝试其他方案
3. 建议提到"验证路径和模式是否正确"

**模型调整策略：**
```
1. 使用 fs_glob("src/**/*.ts") 查找所有ts文件
2. 使用 fs_grep("helper", "src/**/*.ts") 搜索包含helper的文件
3. 找到正确的文件路径后继续操作
```

### 场景：参数验证错误

**工具返回：**
```json
{
  "ok": false,
  "error": "Invalid parameters: path is required",
  "errorType": "validation",
  "retryable": false,
  "recommendations": [
    "检查工具参数是否符合schema要求",
    "确认所有必填参数已提供",
    "检查参数类型是否正确",
    "参考工具手册中的参数说明"
  ]
}
```

**模型分析：**
1. `errorType: "validation"` - 参数问题
2. `retryable: false` - 不应该用相同参数重试
3. 错误明确指出 "path is required"

**模型调整策略：**
```
1. 检查工具调用，发现确实缺少 path 参数
2. 补充必要的 path 参数
3. 重新调用工具
```

## 事件监听

### 监听工具错误（用户层）

```typescript
// 订阅进度事件
for await (const envelope of agent.chatStream(input)) {
  if (envelope.event.type === 'tool:error') {
    console.log('工具错误:', envelope.event.error);
    console.log('工具状态:', envelope.event.call.state);
    // UI 提示用户
  }
}
```

### 监控系统错误（运维层）

```typescript
// 订阅监控事件
agent.subscribe(['monitor']).on('error', (event) => {
  if (event.phase === 'tool') {
    const { errorType, retryable } = event.detail || {};
    
    // 记录到日志系统
    logger.warn('Tool Error', {
      message: event.message,
      errorType,
      retryable,
      severity: event.severity,
      timestamp: Date.now()
    });
    
    // 发送告警
    if (event.severity === 'error') {
      alerting.send('Tool execution failed', event);
    }
  }
});
```

## 稳定性保证

### 多层防护机制

```
第1层：工具执行层 (tool.ts)
  └─ try-catch 捕获所有异常 → {ok: false, _thrownError: true}

第2层：Agent调用层 (agent.ts)  
  └─ try-catch 捕获调用异常 → errorType: 'exception'

第3层：参数验证层
  └─ safeParse 避免验证异常 → {ok: false, _validationError: true}

第4层：Hook执行层
  └─ Hook失败不影响主流程 → 记录错误继续执行
```

### 错误隔离原则

- ✅ 单个工具错误 ≠ Agent崩溃
- ✅ Agent错误 ≠ 系统崩溃
- ✅ 工具间完全隔离
- ✅ 所有错误可追踪

## 最佳实践

### 工具开发者

```typescript
// ✅ 推荐：使用 {ok: false} 返回预期的业务错误
if (!fileExists) {
  return {
    ok: false,
    error: 'File not found',
    recommendations: ['检查文件路径', '使用 fs_glob 搜索文件']
  };
}

// ❌ 避免：抛出异常表示业务错误
throw new Error('File not found');  // 应该只用于意外异常
```

### 应用开发者

```typescript
// 监听错误并做UI提示
agent.subscribe(['progress']).on('tool:error', (event) => {
  showNotification({
    type: 'error',
    message: event.error,
    action: event.call.state === 'FAILED' ? 'retry' : null
  });
});

// 智能重试逻辑
if (result.status === 'paused' && result.permissionIds?.length) {
  // 有pending权限，等待用户决策
} else if (lastError?.retryable && retryCount < 3) {
  // 可重试错误，自动重试
  await agent.send('请根据建议调整后重试');
}
```

### 系统运维

```typescript
// 错误统计和分析
const errorStats = {
  validation: 0,
  runtime: 0,
  logical: 0,
  aborted: 0,
  exception: 0
};

agent.subscribe(['monitor']).on('error', (event) => {
  if (event.phase === 'tool') {
    const type = event.detail?.errorType || 'unknown';
    errorStats[type]++;
    
    // 定期分析错误模式
    if (errorStats.validation > 100) {
      alert('参数验证错误过多，请检查工具schema配置');
    }
  }
});
```

## 新增事件类型

### ProgressToolErrorEvent

```typescript
export interface ProgressToolErrorEvent {
  channel: 'progress';
  type: 'tool:error';
  call: ToolCallSnapshot;  // 工具调用快照
  error: string;           // 错误信息
  bookmark?: Bookmark;     // 事件书签
}
```

**用途：** 让用户和前端能实时感知工具错误，进行UI提示或策略调整。

## 总结

通过这套完整的错误处理机制，实现了：

✅ **模型智能感知**
- 错误类型明确（validation/runtime/logical/aborted/exception）
- 可重试性清晰（retryable: true/false）
- 建议具体可操作（根据工具和错误类型定制）

✅ **程序永不崩溃**
- 工具层 try-catch 兜底
- Agent层 try-catch 保护
- 参数验证 safeParse
- Hook执行隔离

✅ **完整监听记录**
- 进度事件（tool:error）- 用户可见
- 监控事件（error）- 系统记录
- 工具记录（ToolCallRecord）- 完整审计
- 事件时间线（EventBus）- 可回溯

这套机制确保了Agent在长时间运行中能够稳定运行，模型能够自主感知和调整，同时系统提供完整的可观测性。
