import { Application } from "@oak/oak";
import { describe, it } from "bdd";
import { expect } from "expect";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { right } from "shared/either.ts";
import actionsRouter from "./actions_v2_router.ts";

function makeApp(tenant: AntboxTenant): Application {
	const app = new Application();
	const router = actionsRouter([tenant]);
	app.use(router.routes(), router.allowedMethods());
	return app;
}

type RunAction = AntboxTenant["featuresEngine"]["runAction"];

function makeTenant(runAction: RunAction): AntboxTenant {
	return {
		name: "default",
		rootPasswd: "root",
		symmetricKey: "secret",
		limits: { storage: 1, tokens: 0 },
		featuresEngine: { runAction } as AntboxTenant["featuresEngine"],
	} as unknown as AntboxTenant;
}

const okActionResult: RunAction = <T>() => Promise.resolve(right({ ok: true } as T));

describe("actions v2 router", () => {
	it("routes action execution through the documented /-/run endpoint", async () => {
		let observedUuid: string | undefined;
		let observedUuids: string[] | undefined;

		const tenant = makeTenant(<T>(
			_ctx: AuthenticationContext,
			uuid: string,
			uuids: string[],
		) => {
			observedUuid = uuid;
			observedUuids = uuids;
			return Promise.resolve(right({ ok: true } as T));
		});

		const response = await makeApp(tenant).handle(
			new Request("http://localhost/actions/my-action/-/run", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ uuids: ["node-uuid"] }),
			}),
		);

		if (!response) throw new Error("Oak application did not return a response");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(observedUuid).toBe("my-action");
		expect(observedUuids).toEqual(["node-uuid"]);
	});

	it("does not expose the undocumented legacy action execution endpoint", async () => {
		const tenant = makeTenant(okActionResult);

		const response = await makeApp(tenant).handle(
			new Request("http://localhost/actions/my-action", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ uuids: ["node-uuid"] }),
			}),
		);

		if (!response) throw new Error("Oak application did not return a response");

		expect(response.status).toBe(404);
	});
});
