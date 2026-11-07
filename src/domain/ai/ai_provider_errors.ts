import { AntboxError } from "shared/antbox_error.ts";

/** An AI provider failure worth retrying: rate limits, server errors, timeouts and network errors. */
export class TransientAIError extends AntboxError {
	static ERROR_CODE = "TransientAIError";

	constructor(message: string) {
		super(TransientAIError.ERROR_CODE, message);
	}
}

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_NETWORK_CODES = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"ETIMEDOUT",
	"EAI_AGAIN",
	"ENOTFOUND",
	"EPIPE",
	"UND_ERR_SOCKET",
	"UND_ERR_CONNECT_TIMEOUT",
]);

function isTransient(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const { status, code, name, message } = error as {
		status?: unknown;
		code?: unknown;
		name?: unknown;
		message?: unknown;
	};
	if (typeof status === "number") return TRANSIENT_STATUSES.has(status);
	if (typeof code === "string" && TRANSIENT_NETWORK_CODES.has(code)) return true;
	if (name === "TimeoutError" || name === "AbortError") return true;
	return error instanceof TypeError && typeof message === "string" &&
		/fetch failed|network/i.test(message);
}

/**
 * Wraps an error thrown by an AI provider SDK, keeping the HTTP status or network cause that
 * tells whether a retry may succeed.
 */
export function aiErrorFrom(error: unknown, errorCode: string, message: string): AntboxError {
	const detail = `${message}: ${error instanceof Error ? error.message : String(error)}`;
	return isTransient(error) ? new TransientAIError(detail) : new AntboxError(errorCode, detail);
}
