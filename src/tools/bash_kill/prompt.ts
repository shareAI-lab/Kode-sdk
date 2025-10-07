export const DESCRIPTION = 'Kill a background bash shell';

export const PROMPT = `Terminate a long-running background bash session identified by shell_id.

Guidelines:
- Use this to clean up stuck processes.
- Provide the shell_id from bash_run to terminate that specific process.
- Once killed, the process cannot be restarted or accessed.

Safety/Limitations:
- Only background processes started in the current session can be killed.
- Force termination may leave incomplete work or locks.`;
