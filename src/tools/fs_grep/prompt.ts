export const DESCRIPTION = 'Search for text patterns inside files';

export const PROMPT = `Search one or more files for a literal string or regular expression.

Guidelines:
- Use this to locate references before editing.
- The "path" parameter can be a specific file or a glob pattern (e.g., "src/**/*.ts").
- Set "regex" to true to interpret the pattern as a regular expression.
- Case-sensitive by default; set "case_sensitive" to false for case-insensitive search.
- Results include file path, line number, column number, and a preview of the match.

Safety/Limitations:
- Result sets are limited to prevent overwhelming responses.
- Search is constrained to the sandbox directory.`;
