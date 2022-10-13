import { AggregationFormula } from "./smart_folder_node.ts";
import { EcmError } from "/shared/ecm_error.ts";

export class AggregationFormulaError extends EcmError {
  static ERROR_CODE = "AggregationFormulaError";

  constructor(formula: AggregationFormula) {
    super(AggregationFormulaError.ERROR_CODE, `"Invalid formula: '${formula}'`);
  }
}
