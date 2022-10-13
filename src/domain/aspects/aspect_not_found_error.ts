import { EcmError } from "/shared/ecm_error.ts";
const ASPECT_NOT_FOUND_ERROR = "AspectNotFoundError";

export class AspectNotFoundError extends EcmError {
  constructor(uuid: string) {
    super(ASPECT_NOT_FOUND_ERROR, `Aspect not found: '${uuid}'`);
  }
}
