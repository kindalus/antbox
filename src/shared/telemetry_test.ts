import { describe, it } from "bdd";
import { expect } from "expect";
import {
	cleanTelemetryAttributes,
	httpTelemetryAttributes,
	requestedTenantFromRequest,
} from "./telemetry.ts";

describe("telemetry", () => {
	it("derives tenant from header before query parameter", () => {
		const req = new Request("https://example.com/v2/nodes?x-tenant=query-tenant", {
			headers: { "X-Tenant": "header-tenant" },
		});

		expect(requestedTenantFromRequest(req)).toBe("header-tenant");
	});

	it("derives tenant from query parameter when no tenant header is present", () => {
		const req = new Request("https://example.com/v2/nodes?x-tenant=query-tenant");

		expect(requestedTenantFromRequest(req)).toBe("query-tenant");
	});

	it("defaults tenant when no tenant is requested", () => {
		const req = new Request("https://example.com/v2/nodes");

		expect(requestedTenantFromRequest(req)).toBe("default");
	});

	it("builds HTTP attributes without recording query strings", () => {
		const req = new Request(
			"https://example.com:7180/v2/nodes?api_key=secret&x-tenant=tenant-a",
		);

		const attributes = httpTelemetryAttributes(req, "/v2/nodes");

		expect(attributes["http.request.method"]).toBe("GET");
		expect(attributes["http.route"]).toBe("/v2/nodes");
		expect(attributes["url.scheme"]).toBe("https");
		expect(attributes["url.path"]).toBe("/v2/nodes");
		expect(attributes["server.address"]).toBe("example.com");
		expect(attributes["server.port"]).toBe(7180);
		expect(attributes["antbox.tenant"]).toBe("tenant-a");
		expect("url.full" in attributes).toBe(false);
		expect("url.query" in attributes).toBe(false);
	});

	it("removes undefined attributes before passing them to OpenTelemetry", () => {
		const attributes = cleanTelemetryAttributes({
			"http.route": undefined,
			"antbox.tenant": "default",
		});

		expect(attributes).toEqual({ "antbox.tenant": "default" });
	});
});
