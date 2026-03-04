import { describe, it } from "bdd";
import { expect } from "expect";
import {
	requireAuthenticatedPrincipalMiddleware,
	requireBearerTokenMiddleware,
} from "./mcp_authentication_middleware.ts";

const nextHandler = async (_req: Request): Promise<Response> => {
	return new Response("ok", { status: 200 });
};

function createRequest(headers: Record<string, string> = {}): Request {
	return new Request("http://localhost:7180/mcp", {
		method: "POST",
		headers,
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
	});
}

describe("MCP authentication middlewares", () => {
	describe("requireBearerTokenMiddleware", () => {
		it("returns 401 when Authorization header is missing", async () => {
			const handler = requireBearerTokenMiddleware(nextHandler);
			const response = await handler(createRequest());

			expect(response.status).toBe(401);
		});

		it("returns 401 for ApiKey Authorization header", async () => {
			const handler = requireBearerTokenMiddleware(nextHandler);
			const response = await handler(
				createRequest({ Authorization: "ApiKey some-secret" }),
			);

			expect(response.status).toBe(401);
		});

		it("allows Bearer Authorization header", async () => {
			const handler = requireBearerTokenMiddleware(nextHandler);
			const response = await handler(
				createRequest({ Authorization: "Bearer token-value" }),
			);

			expect(response.status).toBe(200);
		});
	});

	describe("requireAuthenticatedPrincipalMiddleware", () => {
		it("returns 401 when principal is missing", async () => {
			const handler = requireAuthenticatedPrincipalMiddleware(nextHandler);
			const response = await handler(
				createRequest({ Authorization: "Bearer token-value" }),
			);

			expect(response.status).toBe(401);
		});

		it("returns 401 when principal is anonymous", async () => {
			const handler = requireAuthenticatedPrincipalMiddleware(nextHandler);
			const response = await handler(
				createRequest({
					Authorization: "Bearer token-value",
					"X-Principal": JSON.stringify({
						email: "anonymous@antbox.io",
						groups: [],
					}),
				}),
			);

			expect(response.status).toBe(401);
		});

		it("allows a valid authenticated principal", async () => {
			const handler = requireAuthenticatedPrincipalMiddleware(nextHandler);
			const response = await handler(
				createRequest({
					Authorization: "Bearer token-value",
					"X-Principal": JSON.stringify({
						email: "user@example.com",
						groups: ["group1"],
					}),
				}),
			);

			expect(response.status).toBe(200);
		});
	});
});
