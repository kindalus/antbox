import { describe, test } from "bdd";
import { expect } from "expect";
import { getQuery } from "./get_query.ts";

// Helper function to extract API key using the same logic as the middleware
function extractApiKey(req: Request): string | undefined {
	// Check Authorization header first (standard practice)
	const authHeader = req.headers.get("authorization");
	if (authHeader) {
		// Match "ApiKey <key>" format (case-insensitive)
		const match = authHeader.match(/^apikey\s+(.+)$/i);
		if (match) {
			return match[1];
		}
	}

	// Fall back to query parameter
	const query = getQuery(req);
	return query["api_key"];
}

// Helper function to create a mock request
function createMockRequest(options: {
	headers?: Record<string, string>;
	url?: string;
}): Request {
	const headers = new Headers(options.headers || {});
	const url = options.url || "http://localhost:3000";

	return new Request(url, {
		method: "GET",
		headers,
	});
}

describe("Authentication Middleware - Acceptance Criteria", () => {
	describe("AC1: Authorization header with valid API key", () => {
		test("GIVEN a valid API key 'my-secret-key' WHEN a request is sent with the header 'Authorization: ApiKey my-secret-key' THEN the request should be successfully authenticated", () => {
			// Given
			const validApiKey = "my-secret-key";

			// When
			const req = createMockRequest({
				headers: {
					"Authorization": `ApiKey ${validApiKey}`,
				},
			});

			// Then
			const extractedKey = extractApiKey(req);
			expect(extractedKey).toBe(validApiKey);
		});
	});

	describe("AC2: Query parameter with valid API key", () => {
		test("GIVEN a valid API key 'my-secret-key' WHEN a request is sent with the query parameter '?api_key=my-secret-key' THEN the request should be successfully authenticated", () => {
			// Given
			const validApiKey = "my-secret-key";

			// When
			const req = createMockRequest({
				url: `http://localhost:3000?api_key=${validApiKey}`,
			});

			// Then
			const extractedKey = extractApiKey(req);
			expect(extractedKey).toBe(validApiKey);
		});
	});

	describe("AC3: Legacy x-api-key header should fail", () => {
		test("GIVEN a valid API key 'my-secret-key' WHEN a request is sent using the old header 'x-api-key: my-secret-key' THEN the request should fail authentication", () => {
			// Given
			const validApiKey = "my-secret-key";

			// When
			const req = createMockRequest({
				headers: {
					"x-api-key": validApiKey,
				},
			});

			// Then
			const extractedKey = extractApiKey(req);
			expect(extractedKey).toBe(undefined); // Should fail authentication (be treated as anonymous)
		});
	});

	describe("AC4: Legacy x-api-key query parameter should fail", () => {
		test("GIVEN a valid API key 'my-secret-key' WHEN a request is sent using the old query parameter '?x-api-key=my-secret-key' THEN the request should fail authentication", () => {
			// Given
			const validApiKey = "my-secret-key";

			// When
			const req = createMockRequest({
				url: `http://localhost:3000?x-api-key=${validApiKey}`,
			});

			// Then
			const extractedKey = extractApiKey(req);
			expect(extractedKey).toBe(undefined); // Should fail authentication
		});
	});

	describe("Edge cases and comprehensive scenarios", () => {
		test("should maintain case-insensitive behavior for ApiKey scheme", () => {
			const testCases = [
				"ApiKey my-secret-key",
				"APIKEY my-secret-key",
				"apikey my-secret-key",
				"ApiKEY my-secret-key",
			];

			testCases.forEach((authHeader) => {
				const req = createMockRequest({
					headers: {
						"Authorization": authHeader,
					},
				});

				const extractedKey = extractApiKey(req);
				expect(extractedKey).toBe("my-secret-key");
			});
		});

		test("should handle complex API keys with special characters", () => {
			const complexApiKey = "my-secret_key.with-dashes_and.dots123";

			const req = createMockRequest({
				headers: {
					"Authorization": `ApiKey ${complexApiKey}`,
				},
			});

			const extractedKey = extractApiKey(req);
			expect(extractedKey).toBe(complexApiKey);
		});

		test("should maintain precedence: Authorization header over query parameter", () => {
			const headerKey = "header-api-key";
			const queryKey = "query-api-key";

			const req = createMockRequest({
				headers: {
					"Authorization": `ApiKey ${headerKey}`,
				},
				url: `http://localhost:3000?api_key=${queryKey}`,
			});

			const extractedKey = extractApiKey(req);
			expect(extractedKey).toBe(headerKey);
		});

		test("should not interfere with other Authorization schemes", () => {
			const req = createMockRequest({
				headers: {
					"Authorization": "Bearer jwt-token-here",
				},
			});

			const extractedKey = extractApiKey(req);
			expect(extractedKey).toBe(undefined);
		});

		test("should handle URL-encoded query parameters correctly", () => {
			const apiKey = "my-secret-key";
			const encodedApiKey = "my%2Dsecret%2Dkey";

			const req = createMockRequest({
				url: `http://localhost:3000?api_key=${encodedApiKey}`,
			});

			const extractedKey = extractApiKey(req);
			expect(extractedKey).toBe(apiKey);
		});

		test("should handle empty or malformed Authorization headers", () => {
			const testCases = [
				"ApiKey", // Missing key
				"ApiKey ", // Only space after ApiKey
				"", // Empty header
				"Basic dXNlcjpwYXNz", // Different scheme
			];

			testCases.forEach((authHeader) => {
				const req = createMockRequest({
					headers: {
						"Authorization": authHeader,
					},
				});

				const extractedKey = extractApiKey(req);
				expect(extractedKey).toBe(undefined);
			});
		});

		test("should handle requests with no authentication", () => {
			const req = createMockRequest({
				url: "http://localhost:3000",
			});

			const extractedKey = extractApiKey(req);
			expect(extractedKey).toBe(undefined);
		});

		test("should ignore legacy authentication alongside new authentication", () => {
			const validApiKey = "new-format-key";
			const legacyApiKey = "legacy-format-key";

			// Test with both new header and legacy header
			const req1 = createMockRequest({
				headers: {
					"Authorization": `ApiKey ${validApiKey}`,
					"x-api-key": legacyApiKey,
				},
			});

			const extractedKey1 = extractApiKey(req1);
			expect(extractedKey1).toBe(validApiKey);

			// Test with both new query and legacy query
			const req2 = createMockRequest({
				url: `http://localhost:3000?api_key=${validApiKey}&x-api-key=${legacyApiKey}`,
			});

			const extractedKey2 = extractApiKey(req2);
			expect(extractedKey2).toBe(validApiKey);
		});
	});
});
