import { Application } from "@oak/oak";
import { describe, it } from "bdd";
import { expect } from "expect";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import extensionsRouter from "./extensions_v2_router.ts";

function makeApp(tenant: AntboxTenant): Application {
	const app = new Application();
	const router = extensionsRouter([tenant]);
	app.use(router.routes(), router.allowedMethods());
	return app;
}

type RunExtension = AntboxTenant["featuresEngine"]["runExtension"];

function makeTenant(runExtension: RunExtension): AntboxTenant {
	return {
		name: "default",
		rootPasswd: "root",
		symmetricKey: "secret",
		limits: { storage: 1, tokens: 0 },
		featuresEngine: { runExtension } as AntboxTenant["featuresEngine"],
	} as unknown as AntboxTenant;
}

describe("extensions v2 router", () => {
	it("routes POST execution and converts the extension UUID to camelCase", async () => {
		let observedUuid: string | undefined;
		let observedBody: unknown;
		const tenant = makeTenant(async (
			_ctx: AuthenticationContext,
			uuid: string,
			request: Request,
		) => {
			observedUuid = uuid;
			observedBody = await request.json();
			return new Response(JSON.stringify({ accepted: true }), {
				status: 202,
				headers: { "content-type": "application/json", "x-extension": "executed" },
			});
		});

		const response = await makeApp(tenant).handle(
			new Request("http://localhost/extensions/calculate-total", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ itemCount: 4 }),
			}),
		);

		if (!response) throw new Error("Oak application did not return a response");
		expect(response.status).toBe(202);
		expect(response.headers.get("x-extension")).toBe("executed");
		expect(await response.json()).toEqual({ accepted: true });
		expect(observedUuid).toBe("calculateTotal");
		expect(observedBody).toEqual({ itemCount: 4 });
	});

	it("routes GET execution with its query parameters", async () => {
		let observedUuid: string | undefined;
		let observedUrl: string | undefined;
		const tenant = makeTenant((
			_ctx: AuthenticationContext,
			uuid: string,
			request: Request,
		) => {
			observedUuid = uuid;
			observedUrl = request.url;
			return Promise.resolve(
				new Response("extension result", {
					headers: { "content-type": "text/plain" },
				}),
			);
		});

		const response = await makeApp(tenant).handle(
			new Request("http://localhost/extensions/report-status?period=monthly"),
		);

		if (!response) throw new Error("Oak application did not return a response");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("extension result");
		expect(observedUuid).toBe("reportStatus");
		expect(observedUrl).toContain("period=monthly");
	});
});
