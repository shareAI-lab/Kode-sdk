export const DESCRIPTION = 'Write contents to a file (creates or overwrites)';

export const PROMPT = `Use this tool to create or overwrite files inside the sandbox.

Guidelines:
- Paths must stay inside the sandbox root. The SDK will deny attempts to escape the workspace.
- Provide the full target contents. The previous file body will be replaced.
- Pair with fs_read when editing existing files so the FilePool can validate freshness.
- The tool returns the number of bytes written for auditing purposes.

Safety/Limitations:
- File freshness validation ensures you don't overwrite externally modified files.
- Large file writes are allowed but may impact performance.`;
