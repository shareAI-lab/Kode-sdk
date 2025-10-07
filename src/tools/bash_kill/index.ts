import { tool } from '../tool';
import { z } from 'zod';
import { DESCRIPTION, PROMPT } from './prompt';
import { ToolContext } from '../../core/types';
import { processes } from '../bash_run';

export const BashKill = tool({
  name: 'bash_kill',
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

    processes.delete(shell_id);

    return {
      ok: true,
      shell_id,
      message: `Killed shell ${shell_id}`,
    };
  },
  metadata: {
    readonly: false,
    version: '1.0',
  },
});

BashKill.prompt = PROMPT;
