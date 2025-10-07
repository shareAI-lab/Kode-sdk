import { tool } from '../tool';
import { z } from 'zod';
import { DESCRIPTION, PROMPT } from './prompt';
import { ToolContext } from '../../core/types';
import { processes } from '../bash_run';

export const BashLogs = tool({
  name: 'bash_logs',
  description: DESCRIPTION,
  parameters: z.object({
    shell_id: z.string().describe('Shell ID from bash_run'),
  }),
  async execute(args) {
    const { shell_id } = args;

    const proc = processes.get(shell_id);
    if (!proc) {
      return {
        ok: false,
        error: `Shell not found: ${shell_id}`,
      };
    }

    const isRunning = proc.code === undefined;
    const status = isRunning ? 'running' : `completed (exit code ${proc.code})`;
    const output = [proc.stdout, proc.stderr].filter(Boolean).join('\n').trim();

    return {
      ok: true,
      shell_id,
      status,
      running: isRunning,
      code: proc.code,
      output: output || '(no output yet)',
    };
  },
  metadata: {
    readonly: true,
    version: '1.0',
  },
});

BashLogs.prompt = PROMPT;
