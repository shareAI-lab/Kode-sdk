# 简化的工具定义 API

## 概述

Kode SDK v2.7 引入了全新的工具定义 API，大幅简化了开发体验：

- ✅ **自动 Schema 生成**：从类型定义自动生成 JSON Schema，无需手动编写
- ✅ **简化的属性标记**：用 `readonly`/`noEffect` 替代复杂的 `access`/`mutates`/`safe`
- ✅ **自定义事件支持**：工具内可发射自定义事件到 monitor 通道
- ✅ **向后兼容**：完全兼容现有的 `ToolInstance` 接口

## 快速开始

### 旧方式（v2.6 及之前）

```typescript
import { ToolInstance } from '@kode/sdk';

const weatherTool: ToolInstance = {
  name: 'get_weather',
  description: 'Get weather information',

  // ❌ 手动编写 JSON Schema - 繁琐且易错
  input_schema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
      units: {
        type: 'string',
        description: 'Temperature units',
        enum: ['celsius', 'fahrenheit']
      }
    },
    required: ['city']
  },

  async exec(args, ctx) {
    return { temperature: 22, condition: 'sunny' };
  },

  toDescriptor() {
    return {
      source: 'registered',
      name: 'get_weather',
      registryId: 'get_weather',
      metadata: {
        access: 'read',    // ❌ 复杂的三字段系统
        mutates: false,
        safe: true
      }
    };
  }
};
```

### 新方式（v2.7+）

```typescript
import { defineTool } from '@kode/sdk';

const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get weather information',

  // ✅ 简洁的参数定义 - 自动生成 Schema
  params: {
    city: {
      type: 'string',
      description: 'City name'
    },
    units: {
      type: 'string',
      description: 'Temperature units',
      enum: ['celsius', 'fahrenheit'],
      required: false,
      default: 'celsius'
    }
  },

  // ✅ 简化的属性标记
  attributes: {
    readonly: true,   // 只读工具
    noEffect: true    // 无副作用，可安全重试
  },

  async exec(args, ctx) {
    // ✅ 自定义事件
    ctx.emit('weather_fetched', { city: args.city });

    return { temperature: 22, condition: 'sunny' };
  }
});
```

## 核心 API

### `defineTool()` - 定义单个工具（推荐）

```typescript
import { defineTool, EnhancedToolContext } from '@kode/sdk';

const myTool = defineTool({
  // 基本信息
  name: 'tool_name',
  description: 'Tool description',

  // 参数定义（自动生成 schema）
  params: {
    param1: { type: 'string', description: '...' },
    param2: { type: 'number', required: false, default: 10 }
  },

  // 工具属性
  attributes: {
    readonly: true,   // 可选，默认 false
    noEffect: true    // 可选，默认 false
  },

  // Prompt 说明书（可选）
  prompt: 'Usage instructions for the model...',

  // 执行函数
  async exec(args, ctx: EnhancedToolContext) {
    // 发射自定义事件
    ctx.emit('custom_event', { data: 'value' });

    return result;
  }
});
```

### `defineTools()` - 批量定义

```typescript
import { defineTools } from '@kode/sdk';

const calculatorTools = defineTools([
  {
    name: 'add',
    description: 'Add two numbers',
    params: {
      a: { type: 'number' },
      b: { type: 'number' }
    },
    attributes: { readonly: true, noEffect: true },
    async exec(args, ctx) {
      return args.a + args.b;
    }
  },
  {
    name: 'multiply',
    description: 'Multiply two numbers',
    params: {
      a: { type: 'number' },
      b: { type: 'number' }
    },
    attributes: { readonly: true, noEffect: true },
    async exec(args, ctx) {
      return args.a * args.b;
    }
  }
]);
```

### `@tool` 装饰器（实验性）

需要在 `tsconfig.json` 启用 `experimentalDecorators`：

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

```typescript
import { tool, extractTools } from '@kode/sdk';

class MyToolset {
  @tool({
    description: 'Query database',
    params: {
      sql: { type: 'string' },
      limit: { type: 'number', required: false, default: 100 }
    },
    attributes: { readonly: true }
  })
  async query(args: { sql: string; limit?: number }, ctx) {
    return await db.query(args.sql, { limit: args.limit });
  }

  @tool({
    description: 'Insert data',
    params: {
      table: { type: 'string' },
      data: { type: 'object' }
    }
  })
  async insert(args, ctx) {
    return await db.insert(args.table, args.data);
  }
}

// 提取工具
const tools = extractTools(new MyToolset());
```

## 参数定义详解

### 基础类型

```typescript
params: {
  str: { type: 'string', description: 'A string' },
  num: { type: 'number', description: 'A number' },
  bool: { type: 'boolean', description: 'A boolean' },

  // 可选参数
  optional: { type: 'string', required: false },

  // 默认值
  withDefault: { type: 'number', default: 42 },

  // 枚举
  choice: {
    type: 'string',
    enum: ['option1', 'option2', 'option3']
  }
}
```

### 复杂类型

```typescript
params: {
  // 数组
  tags: {
    type: 'array',
    description: 'List of tags',
    items: { type: 'string' }
  },

  // 嵌套对象
  profile: {
    type: 'object',
    description: 'User profile',
    properties: {
      email: { type: 'string' },
      age: { type: 'number', required: false },
      roles: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  }
}
```

### 兼容老方式

如果需要更精细的 Schema 控制，仍可直接提供 `input_schema`：

```typescript
defineTool({
  name: 'advanced_tool',
  description: 'Advanced tool',

  // 直接提供 JSON Schema
  input_schema: {
    type: 'object',
    properties: {
      data: {
        type: 'string',
        pattern: '^[A-Z]{3}$',
        minLength: 3,
        maxLength: 3
      }
    },
    required: ['data']
  },

  async exec(args, ctx) {
    // ...
  }
});
```

## 工具属性

### `readonly` - 只读工具

表示工具不修改任何状态（文件、数据库、外部 API）：

```typescript
attributes: {
  readonly: true
}

// 等价于旧方式的：
metadata: {
  access: 'read',
  mutates: false
}
```

**用途**：
- `readonly` 权限模式会自动放行只读工具
- 适用于查询、读取、计算等操作

### `noEffect` - 无副作用

表示工具可以安全重试，多次执行结果相同：

```typescript
attributes: {
  noEffect: true
}

// 等价于旧方式的：
metadata: {
  safe: true
}
```

**用途**：
- Resume 时可安全重新执行
- 适用于幂等操作（GET 请求、纯计算等）

### 默认行为

不设置 `attributes` 时，工具被视为：
- 非只读（可能写入）
- 有副作用（不可重试）

```typescript
// 写入工具 - 无需设置 attributes
defineTool({
  name: 'create_file',
  description: 'Create a file',
  params: { path: { type: 'string' } },
  async exec(args, ctx) {
    await ctx.sandbox.fs.write(args.path, 'content');
    return { ok: true };
  }
});
```

## 自定义事件

### 基本用法

```typescript
defineTool({
  name: 'process_data',
  description: 'Process data',
  params: { input: { type: 'string' } },

  async exec(args, ctx: EnhancedToolContext) {
    // 发射处理开始事件
    ctx.emit('processing_started', { input: args.input });

    const result = await heavyComputation(args.input);

    // 发射处理完成事件
    ctx.emit('processing_completed', {
      result,
      duration: 1234
    });

    return result;
  }
});
```

### 监听自定义事件

```typescript
agent.onMonitor('tool_custom_event', (event) => {
  console.log(`[${event.toolName}] ${event.eventType}:`, event.data);

  // 示例输出：
  // [process_data] processing_started: { input: 'hello' }
  // [process_data] processing_completed: { result: {...}, duration: 1234 }
});
```

### 事件结构

自定义事件会自动包装为 `MonitorToolCustomEvent`：

```typescript
interface MonitorToolCustomEvent {
  channel: 'monitor';
  type: 'tool_custom_event';
  toolName: string;        // 工具名称
  eventType: string;       // 自定义事件类型
  data?: any;              // 事件数据
  timestamp: number;       // 时间戳
  bookmark?: Bookmark;
}
```

### 实际应用场景

```typescript
// 示例：带进度报告的长时间工具
defineTool({
  name: 'batch_process',
  description: 'Process items in batch',
  params: {
    items: { type: 'array', items: { type: 'string' } }
  },

  async exec(args, ctx: EnhancedToolContext) {
    const total = args.items.length;
    const results = [];

    for (let i = 0; i < args.items.length; i++) {
      const item = args.items[i];

      // 报告进度
      ctx.emit('batch_progress', {
        current: i + 1,
        total,
        percentage: Math.round(((i + 1) / total) * 100)
      });

      const result = await processItem(item);
      results.push(result);

      // 检查超时信号
      if (ctx.signal?.aborted) {
        throw new Error('Operation aborted');
      }
    }

    ctx.emit('batch_completed', { count: results.length });

    return results;
  }
});
```

## 完整示例

```typescript
import { Agent, defineTool, defineTools } from '@kode/sdk';

// 定义工具
const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get weather for a city',
  params: {
    city: { type: 'string' },
    units: { type: 'string', enum: ['C', 'F'], required: false, default: 'C' }
  },
  attributes: { readonly: true, noEffect: true },
  prompt: 'Use this to fetch weather. Always specify city name.',

  async exec(args, ctx) {
    ctx.emit('weather_request', { city: args.city });
    const data = await fetch(`/api/weather?city=${args.city}`);
    ctx.emit('weather_response', { city: args.city, temp: data.temp });
    return data;
  }
});

const calculatorTools = defineTools([
  {
    name: 'add',
    description: 'Add numbers',
    params: {
      a: { type: 'number' },
      b: { type: 'number' }
    },
    attributes: { readonly: true, noEffect: true },
    async exec(args, ctx) {
      return args.a + args.b;
    }
  }
]);

// 创建 Agent
const agent = await Agent.create({
  agentId: 'my-agent',
  templateId: 'default',
  provider: { apiKey: process.env.ANTHROPIC_API_KEY! },
  tools: [weatherTool, ...calculatorTools]
});

// 监听自定义事件
agent.onMonitor('tool_custom_event', (event) => {
  if (event.eventType === 'weather_request') {
    console.log(`Fetching weather for ${event.data.city}...`);
  }
  if (event.eventType === 'weather_response') {
    console.log(`Weather: ${event.data.temp}°`);
  }
});

// 使用
await agent.chat('What is the weather in Tokyo?');
```

## 迁移指南

### 从旧 API 迁移

#### 1. 转换基本工具

**旧方式：**
```typescript
const tool: ToolInstance = {
  name: 'my_tool',
  description: 'Does something',
  input_schema: {
    type: 'object',
    properties: {
      input: { type: 'string' }
    },
    required: ['input']
  },
  async exec(args, ctx) { return args.input; },
  toDescriptor() { /* ... */ }
};
```

**新方式：**
```typescript
const tool = defineTool({
  name: 'my_tool',
  description: 'Does something',
  params: {
    input: { type: 'string' }
  },
  async exec(args, ctx) { return args.input; }
});
```

#### 2. 转换 metadata

| 旧方式 | 新方式 |
|--------|--------|
| `{ access: 'read', mutates: false }` | `{ readonly: true }` |
| `{ access: 'write', mutates: true }` | （默认，无需设置） |
| `{ safe: true }` | `{ noEffect: true }` |

#### 3. 添加自定义事件

```typescript
// 旧方式 - 无法发射事件
async exec(args, ctx: ToolContext) {
  // 只能返回结果
  return result;
}

// 新方式 - 可以发射事件
async exec(args, ctx: EnhancedToolContext) {
  ctx.emit('event_name', { data: 'value' });
  return result;
}
```

## 常见问题

### Q: 必须使用新 API 吗？

A: 不，旧的 `ToolInstance` 接口完全兼容。新 API 是可选的增强功能。

### Q: `readonly` 和 `noEffect` 有什么区别？

A:
- `readonly`: 工具不修改任何状态（文件、数据库等）
- `noEffect`: 工具可以安全重试，多次执行结果相同

一个只读工具通常也是无副作用的，但反之不一定成立。

### Q: 自定义事件会被持久化吗？

A: 是的，自定义事件作为 `MonitorToolCustomEvent` 被完整持久化到 WAL，Resume 时可恢复。

### Q: 装饰器方式稳定吗？

A: 装饰器方式是实验性功能，需要 `experimentalDecorators`。推荐使用 `defineTool()` 函数式 API。

### Q: 如何混用新旧 API？

A: 可以自由混用，Agent 接受任何 `ToolInstance`：

```typescript
const agent = await Agent.create({
  tools: [
    oldStyleTool,           // 旧方式
    defineTool({ ... }),    // 新方式
    new FsRead(),           // 内置工具
  ]
});
```

## 最佳实践

1. **优先使用 `defineTool()`**：最简洁、类型安全
2. **合理设置 `attributes`**：帮助权限系统正确判断
3. **善用自定义事件**：提供工具执行的可观测性
4. **复杂 Schema 仍用 `input_schema`**：需要 `pattern`、`minLength` 等高级约束时
5. **批量定义用 `defineTools()`**：保持代码整洁

## 参考

- 示例代码：`examples/tooling/simplified-tools.ts`
- 类型定义：`src/tools/define.ts`
- 事件系统：`docs/events.md`
