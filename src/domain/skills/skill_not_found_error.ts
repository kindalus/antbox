import { AntboxError } from "shared/antbox_error.ts";

export class SkillNotFoundError extends AntboxError {
  static ERROR_CODE = "SkillNotFoundError";

  constructor(uuid: string) {
    super(
      SkillNotFoundError.ERROR_CODE,
      `Could not find skill with uuid: ${uuid}`,
    );
  }
}
