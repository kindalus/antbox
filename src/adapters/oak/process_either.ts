import { Context } from "../../../deps.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either } from "../../shared/either.ts";
import { processError } from "./process_error.ts";
import { sendOK } from "./send_response.ts";

export function processEither<L extends AntboxError, R>(
	ctx: Context,
	result: Either<L, R>,
) {
	if (result.isLeft()) {
		return processError(result.value, ctx);
	}

	return sendOK(ctx, result.value as Record<string, unknown>);
}
