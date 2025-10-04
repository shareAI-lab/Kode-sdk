import { ToolContext } from '../core/types';
import { Tool } from './fs';

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

export class BashRun implements Tool {
  name = 'Bash.Run';
  description = 'Execute a bash command';
  input_schema = {
    type: 'object',
    properties: {
      cmd: { type: 'string', description: 'Command to execute' },
      timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default: 120000)' },
      background: { type: 'boolean', description: 'Run in background and return shell_id' },
    },
    required: ['cmd'],
  };

  async exec(args: { cmd: string; timeout_ms?: number; background?: boolean }, ctx: ToolContext): Promise<any> {
    if (args.background) {
      const id = `shell-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const promise = ctx.sandbox.exec(args.cmd, { timeoutMs: args.timeout_ms });

      const proc: BashProcess = {
        id,
        cmd: args.cmd,
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
      });

      return { shell_id: id, status: 'running' };
    } else {
      const result = await ctx.sandbox.exec(args.cmd, { timeoutMs: args.timeout_ms });
      return {
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }
  }
}

export class BashLogs implements Tool {
  name = 'Bash.Logs';
  description = 'Get output from a background bash shell';
  input_schema = {
    type: 'object',
    properties: {
      shell_id: { type: 'string', description: 'Shell ID from Bash.Run' },
    },
    required: ['shell_id'],
  };

  async exec(args: { shell_id: string }, ctx: ToolContext): Promise<any> {
    const proc = processes.get(args.shell_id);
    if (!proc) {
      throw new Error(`Shell not found: ${args.shell_id}`);
    }

    const isRunning = proc.code === undefined;
    return {
      shell_id: args.shell_id,
      status: isRunning ? 'running' : 'completed',
      code: proc.code,
      stdout: proc.stdout,
      stderr: proc.stderr,
    };
  }
}

export class BashKill implements Tool {
  name = 'Bash.Kill';
  description = 'Kill a background bash shell';
  input_schema = {
    type: 'object',
    properties: {
      shell_id: { type: 'string', description: 'Shell ID from Bash.Run' },
    },
    required: ['shell_id'],
  };

  async exec(args: { shell_id: string }, ctx: ToolContext): Promise<any> {
    const proc = processes.get(args.shell_id);
    if (!proc) {
      throw new Error(`Shell not found: ${args.shell_id}`);
    }

    processes.delete(args.shell_id);
    return { shell_id: args.shell_id, status: 'killed' };
  }
}
