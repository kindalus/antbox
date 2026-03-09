import { describe, it } from "bdd";
import { expect } from "expect";
import { Logger } from "./logger.ts";

describe("Logger", () => {
	it("supports contextual logger instances", () => {
		const originalInfo = console.info;
		const logged: unknown[][] = [];
		console.info = (...args: unknown[]) => {
			logged.push(args);
		};

		try {
			Logger.info("plain message");
			Logger.instance("feature=echo", "tenant=default").info("contextual message");

			expect(logged).toHaveLength(2);
			expect(logged[0]).toEqual(["[INFO]", "plain message"]);
			expect(logged[1]).toEqual([
				"[INFO]",
				"[feature=echo] [tenant=default]",
				"contextual message",
			]);
		} finally {
			console.info = originalInfo;
		}
	});
});
