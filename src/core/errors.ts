export type ResumeErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'AGENT_NOT_FOUND'
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_VERSION_MISMATCH'
  | 'SANDBOX_INIT_FAILED'
  | 'CORRUPTED_DATA';

export class ResumeError extends Error {
  readonly code: ResumeErrorCode;

  constructor(code: ResumeErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ResumeError';
  }
}

export function assert(condition: any, code: ResumeErrorCode, message: string): asserts condition {
  if (!condition) {
    throw new ResumeError(code, message);
  }
}
