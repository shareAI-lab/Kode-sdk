export const DESCRIPTION = 'Read contents from a file';

export const PROMPT = `Use this tool to inspect files within the sandboxed workspace.

Usage guidance:
- Always pass paths relative to the sandbox working directory.
- You may optionally provide "offset" and "limit" to control the slice of lines to inspect.
- Large files will be truncated to keep responses compact; request additional ranges if needed.
- Prefer batching adjacent reads in a single turn to minimize context churn.

Safety/Limitations:
- This tool is read-only and integrates with FilePool for conflict detection.
- File modifications are tracked to warn about stale reads.
- Paths must stay inside the sandbox root directory.`;
