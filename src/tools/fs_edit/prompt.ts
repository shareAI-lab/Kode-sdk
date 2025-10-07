export const DESCRIPTION = 'Edit a file by replacing old_string with new_string';

export const PROMPT = `Use this tool for precise in-place edits.

Guidelines:
- Provide a unique "old_string" snippet to replace. If multiple matches exist, set "replace_all" to true.
- Combine with fs_read to confirm the current file state before editing.
- The tool integrates with FilePool to ensure the file has not changed externally.
- If old_string is not unique, the tool will reject the operation unless replace_all is true.

Safety/Limitations:
- Single replacements require exact unique matches to avoid unintended changes.
- Freshness validation prevents conflicts with external modifications.`;
