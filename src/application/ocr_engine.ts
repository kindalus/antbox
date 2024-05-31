import { AntboxError } from "../shared/antbox_error.ts";
import { Either } from "../shared/either.ts";

export interface OcrEngine {
     recognize(src: File | string, lang?: string): Promise<Either<AntboxError, string>>;

}
