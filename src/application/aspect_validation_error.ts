import { EcmError } from "/shared/ecm_error.ts";

export const ASPECT_VALIDATION_ERROR = "AspectValidationError";

export class AspectValidationError extends EcmError {
  constructor(message: string) {
    super(ASPECT_VALIDATION_ERROR, message);
  }
}
