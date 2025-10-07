import { z, ZodType } from 'zod';
import { tool, ToolDefinition } from './tool';
import type { ToolInstance } from '../index';

/**
 * ToolKit 装饰器元数据
 */
interface ToolMethodMetadata {
  description?: string;
  parameters?: ZodType;
  metadata?: any;
}

/**
 * 工具方法装饰器
 *
 * @example
 * ```ts
 * class WeatherKit extends ToolKit {
 *   @toolMethod({ description: 'Get current weather' })
 *   async getWeather(args: { city: string }, ctx: ToolContext) {
 *     return { temperature: 25, city: args.city };
 *   }
 * }
 * ```
 */
export function toolMethod(metadata: ToolMethodMetadata = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // 存储元数据到类的原型
    if (!target.constructor._toolMethods) {
      target.constructor._toolMethods = new Map();
    }

    target.constructor._toolMethods.set(propertyKey, {
      ...metadata,
      method: descriptor.value,
    });
  };
}

/**
 * ToolKit 基类
 *
 * 提供组织化的工具定义方式
 *
 * @example
 * ```ts
 * class DatabaseKit extends ToolKit {
 *   constructor(private db: Database) {
 *     super('db');
 *   }
 *
 *   @toolMethod({
 *     description: 'Query database',
 *     parameters: z.object({ query: z.string() })
 *   })
 *   async query(args: { query: string }, ctx: ToolContext) {
 *     return await this.db.query(args.query);
 *   }
 *
 *   @toolMethod({ description: 'Insert record' })
 *   async insert(args: { table: string; data: any }, ctx: ToolContext) {
 *     return await this.db.insert(args.table, args.data);
 *   }
 * }
 *
 * // 使用
 * const dbKit = new DatabaseKit(myDatabase);
 * const tools = dbKit.getTools();
 * // 返回: [db__query, db__insert]
 * ```
 */
export class ToolKit {
  constructor(private readonly namespace?: string) {}

  /**
   * 获取所有工具实例
   */
  getTools(): ToolInstance[] {
    const constructor = this.constructor as any;
    const toolMethods = constructor._toolMethods;

    if (!toolMethods) {
      return [];
    }

    const tools: ToolInstance[] = [];

    for (const [methodName, metadata] of toolMethods) {
      const toolName = this.namespace ? `${this.namespace}__${methodName}` : methodName;

      const def: ToolDefinition = {
        name: toolName,
        description: metadata.description || `Execute ${methodName}`,
        parameters: metadata.parameters || z.any(),
        execute: metadata.method.bind(this),
        metadata: metadata.metadata,
      };

      tools.push(tool(def));
    }

    return tools;
  }

  /**
   * 获取工具名称列表
   */
  getToolNames(): string[] {
    return this.getTools().map((t) => t.name);
  }
}
