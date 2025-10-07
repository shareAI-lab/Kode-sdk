import { PermissionConfig } from './template';
import { ToolDescriptor } from '../tools/registry';

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export interface PermissionEvaluationContext {
  toolName: string;
  descriptor?: ToolDescriptor;
  config: PermissionConfig;
}

export type PermissionModeHandler = (ctx: PermissionEvaluationContext) => PermissionDecision;

export interface SerializedPermissionMode {
  name: string;
  builtIn: boolean;
}

export class PermissionModeRegistry {
  private handlers = new Map<string, PermissionModeHandler>();
  private customModes = new Set<string>();

  register(mode: string, handler: PermissionModeHandler, isBuiltIn = false) {
    this.handlers.set(mode, handler);
    if (!isBuiltIn) {
      this.customModes.add(mode);
    }
  }

  get(mode: string): PermissionModeHandler | undefined {
    return this.handlers.get(mode);
  }

  list(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 序列化权限模式配置
   * 仅序列化自定义模式的名称，内置模式在 Resume 时自动恢复
   */
  serialize(): SerializedPermissionMode[] {
    return Array.from(this.handlers.keys()).map(name => ({
      name,
      builtIn: !this.customModes.has(name)
    }));
  }

  /**
   * 验证序列化的权限模式是否可恢复
   * 返回缺失的自定义模式列表
   */
  validateRestore(serialized: SerializedPermissionMode[]): string[] {
    const missing: string[] = [];
    for (const mode of serialized) {
      if (!mode.builtIn && !this.handlers.has(mode.name)) {
        missing.push(mode.name);
      }
    }
    return missing;
  }
}

export const permissionModes = new PermissionModeRegistry();

const MUTATING_ACCESS = new Set(['write', 'execute', 'manage', 'mutate']);

// 内置模式
permissionModes.register('auto', () => 'allow', true);
permissionModes.register('approval', () => 'ask', true);
permissionModes.register('readonly', (ctx) => {
  const metadata = ctx.descriptor?.metadata || {};
  if (metadata.mutates === true) return 'deny';
  if (metadata.mutates === false) return 'allow';
  const access = typeof metadata.access === 'string' ? metadata.access.toLowerCase() : undefined;
  if (access && MUTATING_ACCESS.has(access)) return 'deny';
  return 'ask';
}, true);
