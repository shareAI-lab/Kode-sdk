import { ToolContext, ToolOutcome, HookDecision, PostHookResult } from '../core/types';
import { Hooks } from '../core/hooks';

export interface Tool {
  name: string;
  description: string;
  input_schema: any;
  exec(args: any, ctx: ToolContext): Promise<any>;
  hooks?: Hooks;
  permissionDetails?: (call: any, ctx: ToolContext) => any;
}

export class FsRead implements Tool {
  name = 'Fs.Read';
  description = 'Read contents from a file';
  input_schema = {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Path to file' },
      offset: { type: 'number', description: 'Line offset (optional)' },
      limit: { type: 'number', description: 'Max lines to read (optional)' },
    },
    required: ['file'],
  };

  async exec(args: { file: string; offset?: number; limit?: number }, ctx: ToolContext): Promise<any> {
    const content = await ctx.sandbox.fs.read(args.file);
    const lines = content.split('\n');

    const offset = args.offset || 0;
    const limit = args.limit || lines.length;
    const selected = lines.slice(offset, offset + limit);

    return selected.join('\n');
  }
}

export class FsWrite implements Tool {
  name = 'Fs.Write';
  description = 'Write contents to a file (creates or overwrites)';
  input_schema = {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Path to file' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['file', 'content'],
  };

  async exec(args: { file: string; content: string }, ctx: ToolContext): Promise<any> {
    await ctx.sandbox.fs.write(args.file, args.content);
    return { success: true, file: args.file };
  }
}

export class FsEdit implements Tool {
  name = 'Fs.Edit';
  description = 'Edit a file by replacing old_string with new_string';
  input_schema = {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Path to file' },
      old_string: { type: 'string', description: 'String to replace' },
      new_string: { type: 'string', description: 'Replacement string' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
    },
    required: ['file', 'old_string', 'new_string'],
  };

  async exec(
    args: { file: string; old_string: string; new_string: string; replace_all?: boolean },
    ctx: ToolContext
  ): Promise<any> {
    const content = await ctx.sandbox.fs.read(args.file);

    if (args.replace_all) {
      const updated = content.split(args.old_string).join(args.new_string);
      await ctx.sandbox.fs.write(args.file, updated);
      const count = content.split(args.old_string).length - 1;
      return { success: true, file: args.file, replacements: count };
    } else {
      const occurrences = content.split(args.old_string).length - 1;
      if (occurrences === 0) {
        throw new Error(`old_string not found in ${args.file}`);
      }
      if (occurrences > 1) {
        throw new Error(`old_string appears ${occurrences} times; use replace_all=true or provide unique string`);
      }

      const updated = content.replace(args.old_string, args.new_string);
      await ctx.sandbox.fs.write(args.file, updated);
      return { success: true, file: args.file, replacements: 1 };
    }
  }
}

export function toolTune(
  tool: Tool,
  hooks: {
    preToolUse?: (call: any, ctx: ToolContext) => HookDecision | Promise<HookDecision>;
    postToolUse?: (outcome: ToolOutcome, ctx: ToolContext) => PostHookResult | Promise<PostHookResult>;
    permissionDetails?: (call: any, ctx: ToolContext) => any;
  }
): Tool {
  return {
    ...tool,
    hooks: {
      ...tool.hooks,
      preToolUse: hooks.preToolUse,
      postToolUse: hooks.postToolUse,
    },
    permissionDetails: hooks.permissionDetails || tool.permissionDetails,
  };
}
