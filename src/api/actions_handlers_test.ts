import { describe, it } from "bdd";
import { expect } from "expect";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { runActionHandler } from "./actions_handlers.ts";
import { right } from "shared/either.ts";

function makeTenant(overrides: Partial<AntboxTenant> = {}): AntboxTenant {
	return {
		name: "default",
		rootPasswd: "root",
		symmetricKey: "secret",
		limits: { storage: 1, tokens: 0 },
		configurationRepository: {} as AntboxTenant["configurationRepository"],
		nodeService: {} as AntboxTenant["nodeService"],
		aspectsService: {} as AntboxTenant["aspectsService"],
		featuresService: {} as AntboxTenant["featuresService"],
		apiKeysService: {} as AntboxTenant["apiKeysService"],
		groupsService: {} as AntboxTenant["groupsService"],
		usersService: {} as AntboxTenant["usersService"],
		articleService: {} as AntboxTenant["articleService"],
		auditLoggingService: {} as AntboxTenant["auditLoggingService"],
		workflowsService: {} as AntboxTenant["workflowsService"],
		workflowInstancesService: {} as AntboxTenant["workflowInstancesService"],
		agentsService: {} as AntboxTenant["agentsService"],
		notificationsService: {} as AntboxTenant["notificationsService"],
		userPreferencesService: {} as AntboxTenant["userPreferencesService"],
		externalLoginService: {} as AntboxTenant["externalLoginService"],
		metricsService: {} as AntboxTenant["metricsService"],
		featuresEngine: {} as AntboxTenant["featuresEngine"],
		agentsEngine: {} as AntboxTenant["agentsEngine"],
		workflowInstancesEngine: {} as AntboxTenant["workflowInstancesEngine"],
		...overrides,
	};
}

describe("actions_handlers", () => {
	it("passes action UUIDs through unchanged", async () => {
		let observedUuid: string | undefined;
		let observedUuids: string[] | undefined;
		let observedParameters: Record<string, unknown> | undefined;

		const tenant = makeTenant({
			featuresEngine: {
				runAction: (
					_ctx: AuthenticationContext,
					uuid: string,
					uuids: string[],
					parameters?: Record<string, unknown>,
				) => {
					observedUuid = uuid;
					observedUuids = uuids;
					observedParameters = parameters;
					return Promise.resolve(right({ ok: true }));
				},
			} as unknown as AntboxTenant["featuresEngine"],
		});

		const request = new Request("http://localhost/v2/actions/auto_tag/-/run", {
			method: "POST",
			headers: new Headers({
				"content-type": "application/json",
				"x-params": JSON.stringify({ uuid: "auto_tag" }),
			}),
			body: JSON.stringify({
				uuids: ["node-uuid"],
				parameters: { "aspect-uuid": "invoice-aspect" },
			}),
		});

		const response = await runActionHandler([tenant])(request);

		expect(response.status).toBe(200);
		expect(observedUuid).toBe("auto_tag");
		expect(observedUuids).toEqual(["node-uuid"]);
		expect(observedParameters).toEqual({ aspectUuid: "invoice-aspect" });
	});
});
