import { tool } from '../tool';
import { z } from 'zod';
import { patterns } from '../type-inference';
import { DESCRIPTION, PROMPT } from './prompt';
import { ToolContext } from '../../core/types';

export const FsGlob = tool({
  name: 'fs_glob',
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z.string().describe('Glob pattern to match'),
    cwd: patterns.optionalString('Optional directory to resolve from'),
    dot: z.boolean().optional().describe('Include dotfiles (default: false)'),
    limit: patterns.optionalNumber('Maximum number of results (default: 200)'),
  }),
  async execute(args, ctx: ToolContext) {
    const { pattern, cwd, dot = false, limit = 200 } = args;

    const matches = await ctx.sandbox.fs.glob(pattern, {
      cwd,
      dot,
      absolute: false,
    });

    const truncated = matches.length > limit;
    const results = matches.slice(0, limit);

    return {
      ok: true,
      pattern,
      cwd: cwd || '.',
      truncated,
      count: matches.length,
      matches: results,
    };
  },
  metadata: {
    readonly: true,
    version: '1.0',
  },
});

FsGlob.prompt = PROMPT;
