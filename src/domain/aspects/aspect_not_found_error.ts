import { EcmError } from "/shared/ecm_error.ts";
const ASPECT_NOT_FOUND_ERROR = "AspectNotFoundError";

export class AspectNotFoundError implements EcmError {
  readonly errorCode: string;
  readonly message?: string | undefined;

  constructor(uuid: string) {
    this.errorCode = ASPECT_NOT_FOUND_ERROR;
    this.message = `Aspect not found: '${uuid}'`;
  }
}
