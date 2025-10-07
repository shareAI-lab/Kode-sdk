import { tool } from '../tool';
import { z } from 'zod';
import { patterns } from '../type-inference';
import { DESCRIPTION, PROMPT } from './prompt';
import { ToolContext } from '../../core/types';

export const FsWrite = tool({
  name: 'fs_write',
  description: DESCRIPTION,
  parameters: z.object({
    path: patterns.filePath('Path to file within the sandbox'),
    content: z.string().describe('Content to write'),
  }),
  async execute(args, ctx: ToolContext) {
    const { path, content } = args;

    const freshness = await ctx.services?.filePool?.validateWrite(path);
    if (freshness && !freshness.isFresh) {
      return {
        ok: false,
        error: 'File appears to have changed externally. Please read it again before writing.',
      };
    }

    await ctx.sandbox.fs.write(path, content);
    await ctx.services?.filePool?.recordEdit(path);

    const bytes = Buffer.byteLength(content, 'utf8');
    const lines = content.split('\n').length;

    return {
      ok: true,
      path,
      bytes,
      lines,
    };
  },
  metadata: {
    readonly: false,
    version: '1.0',
  },
});

FsWrite.prompt = PROMPT;
