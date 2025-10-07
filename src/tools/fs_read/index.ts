import { tool } from '../tool';
import { z } from 'zod';
import { patterns } from '../type-inference';
import { DESCRIPTION, PROMPT } from './prompt';
import { ToolContext } from '../../core/types';

export const FsRead = tool({
  name: 'fs_read',
  description: DESCRIPTION,
  parameters: z.object({
    path: patterns.filePath('Path to file relative to sandbox root'),
    offset: patterns.optionalNumber('Line offset (1-indexed)'),
    limit: patterns.optionalNumber('Max lines to read'),
  }),
  async execute(args, ctx: ToolContext) {
    const { path, offset, limit } = args;

    const content = await ctx.sandbox.fs.read(path);
    const lines = content.split('\n');

    const startLine = offset ? offset - 1 : 0;
    const endLine = limit ? startLine + limit : lines.length;
    const selected = lines.slice(startLine, endLine);

    await ctx.services?.filePool?.recordRead(path);

    const truncated = endLine < lines.length;
    const result = selected.join('\n');

    return {
      path,
      offset: startLine + 1,
      limit: selected.length,
      truncated,
      totalLines: lines.length,
      content: result,
    };
  },
  metadata: {
    readonly: true,
    version: '1.0',
  },
});

FsRead.prompt = PROMPT;
