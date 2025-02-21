import { type Either, left, right } from "../../shared/either.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { type OcrEngine } from "../../application/ocr_engine.ts";
import scribe from "scribe.js-ocr";

export default function buildScribeOcrEngine(): Promise<
  Either<AntboxError, OcrEngine>
> {
  return Promise.resolve(right(new ScribeOcrEngine()));
}

export class ScribeOcrEngine implements OcrEngine {
  constructor() {}

  async recognize(
    src: File,
    langs = ["por", "eng"],
  ): Promise<Either<AntboxError, string>> {
    return scribe.extractText([src], langs).then(right).catch(left);
  }
}
