import { describe, it } from "bdd";
import { expect } from "expect";
import { left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { TransientAIError } from "domain/ai/ai_provider_errors.ts";
import { retryDelays, withRetry } from "./retry.ts";

describe("withRetry", () => {
	it("retries transient errors and returns the first success", async () => {
		const waits: number[] = [];
		let calls = 0;
		const result = await withRetry(
			() => {
				calls++;
				return Promise.resolve(
					calls < 3
						? left<AntboxError, string>(new TransientAIError("429 Too Many Requests"))
						: right<AntboxError, string>("ok"),
				);
			},
			{ sleep: (ms) => (waits.push(ms), Promise.resolve()) },
		);
		expect(result.right).toBe("ok");
		expect(calls).toBe(3);
		expect(waits).toHaveLength(2);
	});

	it("does not retry other errors", async () => {
		let calls = 0;
		const result = await withRetry(() => {
			calls++;
			return Promise.resolve(left(new AntboxError("BadRequest", "400")));
		}, { sleep: () => Promise.resolve() });
		expect(result.isLeft()).toBe(true);
		expect(calls).toBe(1);
	});

	it("gives up after the configured attempts", async () => {
		let calls = 0;
		const result = await withRetry(() => {
			calls++;
			return Promise.resolve(left(new TransientAIError("503")));
		}, { attempts: 4, sleep: () => Promise.resolve() });
		expect(result.value).toBeInstanceOf(TransientAIError);
		expect(calls).toBe(4);
	});
});

describe("retryDelays", () => {
	it("grows exponentially, stays under the cap and adds jitter", () => {
		const delays = retryDelays({ attempts: 5, baseMs: 2000, factor: 4, maxMs: 60000 }, () => 1);
		expect(delays).toEqual([2000, 8000, 32000, 60000]);
		const jittered = retryDelays({ attempts: 2, baseMs: 2000, factor: 4, maxMs: 60000 }, () => 0);
		expect(jittered).toEqual([1000]);
	});
});
