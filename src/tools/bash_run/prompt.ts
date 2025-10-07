export const DESCRIPTION = 'Execute a bash command';

export const PROMPT = `Execute shell commands inside the sandbox environment.

Guidelines:
- Commands run with the sandbox's working directory and limited privileges.
- Capture output responsibly; large outputs are truncated and saved to temp files.
- Respect project policies: use fs_read for inspections where possible.
- Request approval when running high-impact commands if required by policy.
- Set "background" to true to run long-running processes and poll with bash_logs.

Safety/Limitations:
- Commands are sandboxed and cannot escape the workspace.
- Dangerous commands may be blocked for security.
- Timeout defaults to 120 seconds but can be configured.
- Background processes must be explicitly killed with bash_kill.`;
