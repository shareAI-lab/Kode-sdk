import { tool } from '../tool';
import { z } from 'zod';
import { patterns } from '../type-inference';
import { DESCRIPTION, PROMPT } from './prompt';
import { ToolContext } from '../../core/types';

export const FsEdit = tool({
  name: 'fs_edit',
  description: DESCRIPTION,
  parameters: z.object({
    path: patterns.filePath('Path to file within the sandbox'),
    old_string: z.string().describe('String to replace'),
    new_string: z.string().describe('Replacement string'),
    replace_all: z.boolean().optional().describe('Replace all occurrences (default: false)'),
  }),
  async execute(args, ctx: ToolContext) {
    const { path, old_string, new_string, replace_all = false } = args;

    const content = await ctx.sandbox.fs.read(path);

    if (replace_all) {
      const occurrences = content.split(old_string).length - 1;
      if (occurrences === 0) {
        return { ok: false, error: 'old_string not found in file' };
      }

      const updated = content.split(old_string).join(new_string);
      await ctx.sandbox.fs.write(path, updated);
      await ctx.services?.filePool?.recordEdit(path);

      return {
        ok: true,
        path,
        replacements: occurrences,
        lines: updated.split('\n').length,
      };
    } else {
      const occurrences = content.split(old_string).length - 1;

      if (occurrences === 0) {
        return { ok: false, error: 'old_string not found in file' };
      }

      if (occurrences > 1) {
        return {
          ok: false,
          error: `old_string appears ${occurrences} times; set replace_all=true or provide more specific text`,
        };
      }

      const updated = content.replace(old_string, new_string);
      await ctx.sandbox.fs.write(path, updated);
      await ctx.services?.filePool?.recordEdit(path);

      return {
        ok: true,
        path,
        replacements: 1,
        lines: updated.split('\n').length,
      };
    }
  },
  metadata: {
    readonly: false,
    version: '1.0',
  },
});

FsEdit.prompt = PROMPT;
