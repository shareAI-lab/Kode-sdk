import { tool } from '../tool';
import { z } from 'zod';
import { patterns } from '../type-inference';
import { DESCRIPTION, PROMPT } from './prompt';
import { ToolContext } from '../../core/types';

interface EditResult {
  path: string;
  replacements: number;
  status: 'ok' | 'skipped' | 'error';
  message?: string;
}

const editSchema = z.object({
  path: patterns.filePath('File path'),
  find: z.string().describe('Existing text to replace'),
  replace: z.string().describe('Replacement text'),
  replace_all: z.boolean().optional().describe('Replace all occurrences (default: false)'),
});

export const FsMultiEdit = tool({
  name: 'fs_multi_edit',
  description: DESCRIPTION,
  parameters: z.object({
    edits: z.array(editSchema).describe('List of edit operations'),
  }),
  async execute(args, ctx: ToolContext) {
    const { edits } = args;
    const results: EditResult[] = [];

    for (const edit of edits) {
      try {
        const freshness = await ctx.services?.filePool?.validateWrite(edit.path);
        if (freshness && !freshness.isFresh) {
          results.push({
            path: edit.path,
            replacements: 0,
            status: 'skipped',
            message: 'File changed externally',
          });
          continue;
        }

        const content = await ctx.sandbox.fs.read(edit.path);

        if (edit.replace_all) {
          const occurrences = content.split(edit.find).length - 1;
          if (occurrences === 0) {
            results.push({
              path: edit.path,
              replacements: 0,
              status: 'skipped',
              message: 'Pattern not found',
            });
            continue;
          }

          const updated = content.split(edit.find).join(edit.replace);
          await ctx.sandbox.fs.write(edit.path, updated);
          await ctx.services?.filePool?.recordEdit(edit.path);

          results.push({
            path: edit.path,
            replacements: occurrences,
            status: 'ok',
          });
        } else {
          const index = content.indexOf(edit.find);
          if (index === -1) {
            results.push({
              path: edit.path,
              replacements: 0,
              status: 'skipped',
              message: 'Pattern not found',
            });
            continue;
          }

          const occurrences = content.split(edit.find).length - 1;
          if (occurrences > 1) {
            results.push({
              path: edit.path,
              replacements: 0,
              status: 'skipped',
              message: `Pattern occurs ${occurrences} times; set replace_all=true if intended`,
            });
            continue;
          }

          const updated = content.replace(edit.find, edit.replace);
          await ctx.sandbox.fs.write(edit.path, updated);
          await ctx.services?.filePool?.recordEdit(edit.path);

          results.push({
            path: edit.path,
            replacements: 1,
            status: 'ok',
          });
        }
      } catch (error: any) {
        results.push({
          path: edit.path,
          replacements: 0,
          status: 'error',
          message: error?.message || String(error),
        });
      }
    }

    return {
      ok: results.every((r) => r.status === 'ok'),
      results,
    };
  },
  metadata: {
    readonly: false,
    version: '1.0',
  },
});

FsMultiEdit.prompt = PROMPT;
