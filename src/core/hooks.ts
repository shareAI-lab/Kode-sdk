import { ToolCall, ToolOutcome, HookDecision, PostHookResult, ToolContext } from '../core/types';
import { ModelResponse } from '../infra/provider';

export interface Hooks {
  preToolUse?: (call: ToolCall, ctx: ToolContext) => HookDecision | Promise<HookDecision>;
  postToolUse?: (outcome: ToolOutcome, ctx: ToolContext) => PostHookResult | Promise<PostHookResult>;
  preModel?: (request: any) => void | Promise<void>;
  postModel?: (response: ModelResponse) => void | Promise<void>;
  messagesChanged?: (snapshot: any) => void | Promise<void>;
}

export interface RegisteredHook {
  origin: 'agent' | 'toolTune';
  names: Array<'preToolUse' | 'postToolUse' | 'preModel' | 'postModel'>;
}

export class HookManager {
  private hooks: Array<{ hooks: Hooks; origin: 'agent' | 'toolTune' }> = [];

  register(hooks: Hooks, origin: 'agent' | 'toolTune' = 'agent') {
    this.hooks.push({ hooks, origin });
  }

  getRegistered(): ReadonlyArray<RegisteredHook> {
    return this.hooks.map(({ hooks, origin }) => ({
      origin,
      names: [
        hooks.preToolUse && 'preToolUse',
        hooks.postToolUse && 'postToolUse',
        hooks.preModel && 'preModel',
        hooks.postModel && 'postModel',
      ].filter(Boolean) as Array<'preToolUse' | 'postToolUse' | 'preModel' | 'postModel'>,
    }));
  }

  async runPreToolUse(call: ToolCall, ctx: ToolContext): Promise<HookDecision> {
    for (const { hooks } of this.hooks) {
      if (hooks.preToolUse) {
        const result = await hooks.preToolUse(call, ctx);
        if (result) return result;
      }
    }
    return undefined;
  }

  async runPostToolUse(outcome: ToolOutcome, ctx: ToolContext): Promise<ToolOutcome> {
    let current = outcome;

    for (const { hooks } of this.hooks) {
      if (hooks.postToolUse) {
        const result = await hooks.postToolUse(current, ctx);
        if (result && typeof result === 'object') {
          if ('replace' in result) {
            current = result.replace;
          } else if ('update' in result) {
            current = { ...current, ...result.update };
          }
        }
      }
    }

    return current;
  }

  async runPreModel(request: any) {
    for (const { hooks } of this.hooks) {
      if (hooks.preModel) {
        await hooks.preModel(request);
      }
    }
  }

  async runPostModel(response: ModelResponse) {
    for (const { hooks } of this.hooks) {
      if (hooks.postModel) {
        await hooks.postModel(response);
      }
    }
  }

  async runMessagesChanged(snapshot: any) {
    for (const { hooks } of this.hooks) {
      if (hooks.messagesChanged) {
        await hooks.messagesChanged(snapshot);
      }
    }
  }
}
