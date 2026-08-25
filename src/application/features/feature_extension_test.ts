import { describe, it } from "bdd";
import { expect } from "expect";
import type { FeatureData } from "domain/configuration/feature_data.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { right } from "shared/either.ts";
import { runFeatureExtension } from "./feature_extension.ts";

const ctx: AuthenticationContext = {
	tenant: "test",
	mode: "Direct",
	principal: { email: "extension@example.com", groups: [] },
};

function exposedFeature(returnType: FeatureData["returnType"]): FeatureData {
	return {
		exposeExtension: true,
		returnType,
	} as FeatureData;
}

describe("runFeatureExtension", () => {
	it("passes a native Response through unchanged", async () => {
		const nativeResponse = Response.json(
			{ ok: false, error: "Product not found" },
			{ status: 404, headers: { "x-extension": "product-detail" } },
		);

		const response = await runFeatureExtension(
			ctx,
			"productDetail",
			new Request("https://vpim.example/api/extensions/product-detail?sku=missing"),
			{
				getFeature: () => Promise.resolve(right(exposedFeature("object"))),
				execute: () => Promise.resolve(right(nativeResponse)),
			},
		);

		expect(response).toBe(nativeResponse);
		expect(response.status).toBe(404);
		expect(response.headers.get("x-extension")).toBe("product-detail");
		expect(await response.json()).toEqual({ ok: false, error: "Product not found" });
	});

	it("keeps serializing ordinary values from returnType", async () => {
		const response = await runFeatureExtension(
			ctx,
			"productDetail",
			new Request("https://vpim.example/api/extensions/product-detail"),
			{
				getFeature: () => Promise.resolve(right(exposedFeature("object"))),
				execute: () => Promise.resolve(right({ ok: true })),
			},
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(await response.json()).toEqual({ ok: true });
	});
});
