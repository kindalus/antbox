import type { Either } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import { TransientAIError } from "domain/ai/ai_provider_errors.ts";

export interface RetryOptions {
	/** Total attempts, including the first one. */
	attempts?: number;
	baseMs?: number;
	factor?: number;
	maxMs?: number;
	/** Waits between attempts; replaced in tests. */
	sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS = { attempts: 4, baseMs: 2000, factor: 4, maxMs: 60_000 };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Delays before each retry: exponential, capped, with jitter between half and the full delay. */
export function retryDelays(
	options: Required<Omit<RetryOptions, "sleep">>,
	random: () => number = Math.random,
): number[] {
	return Array.from({ length: Math.max(0, options.attempts - 1) }, (_, i) => {
		const raw = Math.min(options.maxMs, options.baseMs * options.factor ** i);
		return Math.round(raw * (0.5 + 0.5 * random()));
	});
}

/** Runs fn again while it returns a TransientAIError, up to the configured attempts. */
export async function withRetry<T>(
	fn: () => Promise<Either<AntboxError, T>>,
	options: RetryOptions = {},
): Promise<Either<AntboxError, T>> {
	const { sleep = defaultSleep, ...rest } = options;
	const delays = retryDelays({ ...DEFAULTS, ...rest });

	let result = await fn();
	for (const delay of delays) {
		if (result.isRight() || !(result.value instanceof TransientAIError)) return result;
		await sleep(delay);
		result = await fn();
	}
	return result;
}
