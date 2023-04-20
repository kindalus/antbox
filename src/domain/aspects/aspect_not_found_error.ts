const ASPECT_NOT_FOUND_ERROR = "AspectNotFoundError";

export class AspectNotFoundError extends AntboxError {
  constructor(uuid: string) {
    super(ASPECT_NOT_FOUND_ERROR, `Aspect not found: '${uuid}'`);
  }
}
