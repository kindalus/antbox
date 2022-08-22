import { EcmError } from "/shared/ecm_error.ts";

export const ASPECT_VALIDATION_ERROR = "AspectValidationError";

export class AspectValidationError implements EcmError {
  readonly errorCode: string;
  readonly message?: string | undefined;

  constructor(message: string) {
    this.errorCode = ASPECT_VALIDATION_ERROR;
    this.message = message;
  }
}
