export const DESCRIPTION = 'Apply multiple string replacements across files';

export const PROMPT = `Batch apply targeted edits across files.

Guidelines:
- Each operation specifies a path and the text to replace.
- Use fs_read to verify context beforehand.
- All edits are applied sequentially; failures are isolated per file.
- Each edit includes status feedback (ok, skipped, or error).

Safety/Limitations:
- Freshness validation prevents conflicts with external modifications.
- Failed edits are reported but don't halt the batch.
- Non-unique patterns require explicit replace_all flag.`;
