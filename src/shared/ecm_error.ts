export interface EcmError {
  readonly errorCode: string;
  readonly message?: string;
}

export class ForbiddenError implements EcmError {
  readonly errorCode: string;

  constructor() {
    this.errorCode = "ForbiddenError";
  }
}
