import { PermissionConfig } from '../template';
import { ToolDescriptor } from '../../tools/registry';
import { permissionModes, PermissionEvaluationContext, PermissionDecision } from '../permission-modes';

export class PermissionManager {
  constructor(
    private readonly config: PermissionConfig,
    private readonly descriptors: Map<string, ToolDescriptor>
  ) {}

  evaluate(toolName: string): PermissionDecision {
    if (this.config.denyTools?.includes(toolName)) {
      return 'deny';
    }

    if (this.config.allowTools && this.config.allowTools.length > 0 && !this.config.allowTools.includes(toolName)) {
      return 'deny';
    }

    if (this.config.requireApprovalTools?.includes(toolName)) {
      return 'ask';
    }

    const handler = permissionModes.get(this.config.mode || 'auto') || permissionModes.get('auto');
    if (!handler) {
      return 'allow';
    }

    const context: PermissionEvaluationContext = {
      toolName,
      descriptor: this.descriptors.get(toolName),
      config: this.config,
    };

    return handler(context);
  }
}
