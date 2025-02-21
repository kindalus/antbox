import { AntboxError } from "../shared/antbox_error.ts";
import { type Either } from "../shared/either.ts";

export interface OcrEngine {
  recognize(
    src: File | string,
    langs?: string[],
  ): Promise<Either<AntboxError, string>>;
}
