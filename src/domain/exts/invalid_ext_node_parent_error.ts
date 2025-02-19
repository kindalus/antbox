import { AntboxError } from "../../shared/antbox_error.ts";

export class InvalidExtNodeParentError extends AntboxError {
    static ERROR_CODE = "InvalidExtNodeParent"

    constructor(parent: string) {
        super(InvalidExtNodeParentError.ERROR_CODE, `Invalid ExtNode Parent: ${parent}`);
    }
}