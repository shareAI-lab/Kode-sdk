/**
 * 简化的工具定义 API - 提供更好的开发体验
 *
 * 设计目标：
 * 1. 自动从 TypeScript 类型生成 input_schema
 * 2. 简化 metadata 为 readonly/noEffect 布尔值
 * 3. 支持工具内发射自定义事件
 */

import { ToolContext } from '../core/types';
import { ToolInstance, ToolDescriptor, globalToolRegistry } from './registry';

// 工具属性标记（替代复杂的 metadata）
export interface ToolAttributes {
  /** 工具是否为只读（不修改任何状态） */
  readonly?: boolean;
  /** 工具是否无副作用（可安全重试） */
  noEffect?: boolean;
}

// 参数定义（简化版，自动生成 schema）
export interface ParamDef {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: any;
  enum?: any[];
  items?: ParamDef;  // for array
  properties?: Record<string, ParamDef>;  // for object
}

// 工具增强上下文（支持自定义事件）
export interface EnhancedToolContext extends ToolContext {
  /** 发射自定义事件（会自动添加到 monitor 通道） */
  emit(eventType: string, data?: any): void;
}

// 简化的工具定义接口
export interface SimpleToolDef<TArgs = any, TResult = any> {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数定义（可选，如果提供则自动生成 schema） */
  params?: Record<string, ParamDef>;
  /** 或者直接提供 JSON Schema（兼容老方式） */
  input_schema?: any;
  /** 工具属性 */
  attributes?: ToolAttributes;
  /** Prompt 说明书 */
  prompt?: string;
  /** 执行函数 */
  exec(args: TArgs, ctx: EnhancedToolContext): Promise<TResult> | TResult;
}

/**
 * 从参数定义自动生成 JSON Schema
 */
function generateSchema(params?: Record<string, ParamDef>): any {
  if (!params) {
    return { type: 'object', properties: {} };
  }

  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, def] of Object.entries(params)) {
    const prop: any = { type: def.type };

    if (def.description) prop.description = def.description;
    if (def.enum) prop.enum = def.enum;
    if (def.default !== undefined) prop.default = def.default;

    if (def.type === 'array' && def.items) {
      prop.items = generateSchemaProp(def.items);
    }

    if (def.type === 'object' && def.properties) {
      const nested = generateSchema(def.properties);
      prop.properties = nested.properties;
      if (nested.required?.length > 0) {
        prop.required = nested.required;
      }
    }

    properties[key] = prop;

    if (def.required !== false) {  // default required
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function generateSchemaProp(def: ParamDef): any {
  const prop: any = { type: def.type };
  if (def.description) prop.description = def.description;
  if (def.enum) prop.enum = def.enum;

  if (def.type === 'array' && def.items) {
    prop.items = generateSchemaProp(def.items);
  }

  if (def.type === 'object' && def.properties) {
    const nested = generateSchema(def.properties);
    prop.properties = nested.properties;
    if (nested.required?.length > 0) {
      prop.required = nested.required;
    }
  }

  return prop;
}

/**
 * 定义工具（简化版）
 *
 * @example
 * ```ts
 * const greet = defineTool({
 *   name: 'greet',
 *   description: 'Greet a person',
 *   params: {
 *     name: { type: 'string', description: 'Person name' },
 *     formal: { type: 'boolean', description: 'Use formal greeting', required: false }
 *   },
 *   attributes: { readonly: true, noEffect: true },
 *   async exec(args, ctx) {
 *     const greeting = args.formal ? `Good day, ${args.name}` : `Hi ${args.name}!`;
 *
 *     // 自定义事件
 *     ctx.emit('greeting_sent', { name: args.name, greeting });
 *
 *     return { greeting };
 *   }
 * });
 * ```
 */
export function defineTool<TArgs = any, TResult = any>(
  def: SimpleToolDef<TArgs, TResult>,
  options?: { autoRegister?: boolean }
): ToolInstance {
  // 自动生成 schema 或使用提供的
  const input_schema = def.input_schema || generateSchema(def.params);

  const toolInstance: ToolInstance = {
    name: def.name,
    description: def.description,
    input_schema,
    prompt: def.prompt,

    async exec(args: any, ctx: ToolContext): Promise<any> {
      // 增强上下文，添加 emit 方法
      const enhancedCtx: EnhancedToolContext = {
        ...ctx,
        emit(eventType: string, data?: any) {
          // 发射自定义事件到 monitor 通道
          ctx.agent?.events?.emitMonitor({
            type: 'tool_custom_event' as any,
            toolName: def.name,
            eventType,
            data,
            timestamp: Date.now(),
          } as any);
        },
      };

      return await def.exec(args, enhancedCtx);
    },

    toDescriptor(): ToolDescriptor {
      const metadata: Record<string, any> = {
        tuned: false,
      };

      // 转换简化的 attributes 为内部 metadata
      if (def.attributes?.readonly) {
        metadata.access = 'read';
        metadata.mutates = false;
      } else {
        metadata.access = 'write';
        metadata.mutates = true;
      }

      if (def.attributes?.noEffect !== undefined) {
        metadata.safe = def.attributes.noEffect;
      }

      if (def.prompt) {
        metadata.prompt = def.prompt;
      }

      return {
        source: 'registered',
        name: def.name,
        registryId: def.name,
        metadata,
      };
    },
  };

  // 自动注册到全局 registry (支持 Resume)
  if (options?.autoRegister !== false) {
    globalToolRegistry.register(def.name, (_config) => {
      // 工厂函数：根据 config 重建工具实例
      // 注意：使用 autoRegister: false 避免重复注册
      return defineTool(def, { autoRegister: false });
    });
  }

  return toolInstance;
}

/**
 * 批量定义工具
 */
export function defineTools(defs: SimpleToolDef[]): ToolInstance[] {
  return defs.map((def) => defineTool(def));
}

/**
 * 工具装饰器（实验性 - 需要 experimentalDecorators）
 *
 * @example
 * ```ts
 * class MyTools {
 *   @tool({
 *     description: 'Calculate sum',
 *     params: {
 *       a: { type: 'number' },
 *       b: { type: 'number' }
 *     },
 *     attributes: { readonly: true, noEffect: true }
 *   })
 *   async sum(args: { a: number; b: number }, ctx: EnhancedToolContext) {
 *     return args.a + args.b;
 *   }
 * }
 * ```
 */
export function tool(config: Omit<SimpleToolDef, 'name' | 'exec'>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    // 存储工具配置到类的元数据
    if (!target.constructor._toolConfigs) {
      target.constructor._toolConfigs = new Map();
    }

    target.constructor._toolConfigs.set(propertyKey, {
      ...config,
      name: propertyKey,
      exec: originalMethod,
    });
  };
}

/**
 * 从带装饰器的类提取所有工具
 */
export function extractTools(instance: any): ToolInstance[] {
  const configs = instance.constructor._toolConfigs;
  if (!configs) return [];

  const tools: ToolInstance[] = [];
  for (const [_methodName, config] of configs) {
    tools.push(
      defineTool(
        {
          ...config,
          exec: config.exec.bind(instance),
        },
        { autoRegister: true }  // 装饰器定义的工具也自动注册
      )
    );
  }

  return tools;
}
