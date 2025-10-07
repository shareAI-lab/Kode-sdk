import { tool } from '../tool';
import { z } from 'zod';
import { patterns } from '../type-inference';
import { DESCRIPTION, PROMPT } from './prompt';
import { ToolContext } from '../../core/types';

interface BashProcess {
  id: string;
  cmd: string;
  startTime: number;
  promise: Promise<{ code: number; stdout: string; stderr: string }>;
  stdout: string;
  stderr: string;
  code?: number;
}

const processes = new Map<string, BashProcess>();

export const BashRun = tool({
  name: 'bash_run',
  description: DESCRIPTION,
  parameters: z.object({
    cmd: z.string().describe('Command to execute'),
    timeout_ms: patterns.optionalNumber('Timeout in milliseconds (default: 120000)'),
    background: z.boolean().optional().describe('Run in background and return shell_id'),
  }),
  async execute(args, ctx: ToolContext) {
    const { cmd, timeout_ms = 120000, background = false } = args;

    if (background) {
      const id = `shell-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const promise = ctx.sandbox.exec(cmd, { timeoutMs: timeout_ms });

      const proc: BashProcess = {
        id,
        cmd,
        startTime: Date.now(),
        promise,
        stdout: '',
        stderr: '',
      };

      processes.set(id, proc);

      promise.then((result: any) => {
        proc.code = result.code;
        proc.stdout = result.stdout;
        proc.stderr = result.stderr;
      }).catch((error: any) => {
        proc.code = -1;
        proc.stderr = error?.message || String(error);
      });

      return {
        background: true,
        shell_id: id,
        message: `Background shell started: ${id}`,
      };
    } else {
      const result = await ctx.sandbox.exec(cmd, { timeoutMs: timeout_ms });
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();

      return {
        background: false,
        code: result.code,
        output: output || '(no output)',
      };
    }
  },
  metadata: {
    readonly: false,
    version: '1.0',
  },
});

BashRun.prompt = PROMPT;

export { processes };
