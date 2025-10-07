import { Hooks } from '../core/hooks';
import { ToolContext } from '../core/types';

export type ToolSource = 'builtin' | 'registered' | 'mcp';

export interface ToolDescriptor {
  source: ToolSource;
  name: string;
  registryId?: string;
  config?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ToolInstance {
  name: string;
  description: string;
  input_schema: any;
  hooks?: Hooks;
  permissionDetails?: (call: any, ctx: ToolContext) => any;
  exec(args: any, ctx: ToolContext): Promise<any>;
  prompt?: string | ((ctx: ToolContext) => string | Promise<string>);
  toDescriptor(): ToolDescriptor;
}

export type ToolFactory = (config?: Record<string, any>) => ToolInstance;

export class ToolRegistry {
  private factories = new Map<string, ToolFactory>();

  register(id: string, factory: ToolFactory): void {
    this.factories.set(id, factory);
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  create(id: string, config?: Record<string, any>): ToolInstance {
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`Tool not registered: ${id}`);
    }
    return factory(config);
  }

  list(): string[] {
    return Array.from(this.factories.keys());
  }
}

export const globalToolRegistry = new ToolRegistry();
