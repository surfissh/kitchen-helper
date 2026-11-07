import type { ErrorCode } from "../model/types.ts";

/** Failure that maps directly to one of the error screens. */
export class RecipePipelineError extends Error {
  readonly code: ErrorCode;
  readonly detail: string;

  constructor(code: ErrorCode, message: string, detail = "") {
    super(message);
    this.name = "RecipePipelineError";
    this.code = code;
    this.detail = detail;
  }
}

export function isRecipePipelineError(error: unknown): error is RecipePipelineError {
  return error instanceof RecipePipelineError;
}
