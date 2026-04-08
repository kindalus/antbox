import { describe, it } from "bdd";
import { expect } from "expect";
import { SERVER_HEADER_VALUE } from "shared/app_metadata.ts";
import { serverHeaderMiddleware } from "./server.ts";

describe("oak server", () => {
	it("adds the canonical Server header to HTTP responses", async () => {
		const headers = new Headers();
		const ctx = {
			response: {
				headers,
			},
		};

		await serverHeaderMiddleware(
			ctx as never,
			async () => {
				headers.set("Content-Type", "application/json");
			},
		);

		expect(headers.get("Server")).toBe(SERVER_HEADER_VALUE);
		expect(headers.get("Content-Type")).toBe("application/json");
	});
});
