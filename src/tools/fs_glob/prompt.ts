export const DESCRIPTION = 'List files matching glob patterns';

export const PROMPT = `Use this tool to locate files with glob patterns (e.g. "src/**/*.ts").

Guidelines:
- It respects sandbox boundaries and returns relative paths by default.
- Use standard glob syntax: * (any chars), ** (recursive directories), ? (single char).
- Set "dot" to true to include hidden files (starting with .).
- Results are limited to prevent overwhelming responses.

Safety/Limitations:
- All paths are restricted to the sandbox root directory.
- Large result sets are truncated with a warning.`;
