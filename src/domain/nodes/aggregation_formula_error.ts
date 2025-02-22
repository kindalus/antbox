import { AntboxError } from "shared/antbox_error.ts";
import { type AggregationFormula } from "./smart_folder_node.ts";

export class AggregationFormulaError extends AntboxError {
  static ERROR_CODE = "AggregationFormulaError";

  constructor(formula: AggregationFormula) {
    super(AggregationFormulaError.ERROR_CODE, `"Invalid formula: '${formula}'`);
  }
}
