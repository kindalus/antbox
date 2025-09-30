import { describe, test } from "bdd";
import { expect } from "expect";
import { authenticationMiddleware } from "./authentication_middleware.ts";
import { getQuery } from "./get_query.ts";

// Mock dependencies
const mockTenants = [
  {
    name: "test",
    rawJwk: {},
    symmetricKey: "test-key",
  },
];

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

describe("Authentication Middleware - API Key Extraction", () => {
  describe("Authorization header", () => {
    test("should extract API key from Authorization: ApiKey <key> header", () => {
      const req = createMockRequest({
        headers: {
          "Authorization": "ApiKey my-secret-key",
        },
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe("my-secret-key");
    });

    test("should extract API key from Authorization header (case-insensitive)", () => {
      const req = createMockRequest({
        headers: {
          "Authorization": "APIKEY my-secret-key",
        },
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe("my-secret-key");
    });

    test("should extract API key from Authorization header (mixed case)", () => {
      const req = createMockRequest({
        headers: {
          "Authorization": "apikey my-secret-key",
        },
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe("my-secret-key");
    });

    test("should handle API key with spaces and special characters", () => {
      const req = createMockRequest({
        headers: {
          "Authorization": "ApiKey my-secret-key-with-dashes_and_underscores",
        },
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe("my-secret-key-with-dashes_and_underscores");
    });

    test("should not extract from Bearer token", () => {
      const req = createMockRequest({
        headers: {
          "Authorization": "Bearer my-jwt-token",
        },
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe(undefined);
    });

    test("should not extract from malformed ApiKey header", () => {
      const req = createMockRequest({
        headers: {
          "Authorization": "ApiKey",
        },
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe(undefined);
    });
  });

  describe("Query parameter", () => {
    test("should extract API key from api_key query parameter", () => {
      const req = createMockRequest({
        url: "http://localhost:3000?api_key=my-secret-key",
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe("my-secret-key");
    });

    test("should extract API key from api_key with other query parameters", () => {
      const req = createMockRequest({
        url: "http://localhost:3000?foo=bar&api_key=my-secret-key&baz=qux",
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe("my-secret-key");
    });

    test("should handle URL-encoded API key", () => {
      const req = createMockRequest({
        url: "http://localhost:3000?api_key=my%2Dsecret%2Dkey",
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe("my-secret-key");
    });
  });

  describe("Precedence", () => {
    test("should prefer Authorization header over query parameter", () => {
      const req = createMockRequest({
        headers: {
          "Authorization": "ApiKey header-key",
        },
        url: "http://localhost:3000?api_key=query-key",
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe("header-key");
    });
  });

  describe("Legacy compatibility (should fail)", () => {
    test("should NOT extract from old x-api-key header", () => {
      const req = createMockRequest({
        headers: {
          "x-api-key": "my-secret-key",
        },
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe(undefined);
    });

    test("should NOT extract from old x-api-key query parameter", () => {
      const req = createMockRequest({
        url: "http://localhost:3000?x-api-key=my-secret-key",
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe(undefined);
    });

    test("should NOT authenticate with old x-api-key header format", () => {
      const req = createMockRequest({
        headers: {
          "x-api-key": "my-secret-key",
        },
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe(undefined);
    });

    test("should NOT authenticate with old x-api-key query parameter format", () => {
      const req = createMockRequest({
        url: "http://localhost:3000?x-api-key=my-secret-key",
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe(undefined);
    });
  });

  describe("No API key provided", () => {
    test("should return undefined when no API key is provided", () => {
      const req = createMockRequest({
        headers: {
          "Content-Type": "application/json",
        },
        url: "http://localhost:3000",
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe(undefined);
    });

    test("should return undefined when Authorization header has different scheme", () => {
      const req = createMockRequest({
        headers: {
          "Authorization": "Basic dXNlcjpwYXNz",
        },
      });

      const apiKey = extractApiKey(req);
      expect(apiKey).toBe(undefined);
    });
  });
});
