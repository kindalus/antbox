import { describe, it } from "bdd";
import { expect } from "expect";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { getStorageUsageHandler, getTokenUsageHandler } from "./metrics_handlers.ts";
import { right } from "shared/either.ts";

function makeTenant(overrides: Partial<AntboxTenant> = {}): AntboxTenant {
	return {
		name: "default",
		rootPasswd: "root",
		symmetricKey: "secret",
		limits: { storage: 1, tokens: 1 },
		configurationRepository: {} as AntboxTenant["configurationRepository"],
		nodeService: {} as AntboxTenant["nodeService"],
		aspectsService: {} as AntboxTenant["aspectsService"],
		featuresService: {} as AntboxTenant["featuresService"],
		apiKeysService: undefined as unknown as AntboxTenant["apiKeysService"],
		groupsService: {} as AntboxTenant["groupsService"],
		usersService: {} as AntboxTenant["usersService"],
		articleService: {} as AntboxTenant["articleService"],
		auditLoggingService: {} as AntboxTenant["auditLoggingService"],
		workflowsService: {} as AntboxTenant["workflowsService"],
		workflowInstancesService: {} as AntboxTenant["workflowInstancesService"],
		agentsService: {} as AntboxTenant["agentsService"],
		notificationsService: {} as AntboxTenant["notificationsService"],
		userPreferencesService: {} as AntboxTenant["userPreferencesService"],
		externalLoginService: undefined as unknown as AntboxTenant["externalLoginService"],
		metricsService: {
			getStorageUsage: async () => right({ totalGb: 42, limitGb: 1 }),
			getTokenUsage: async (year: number, month: number) =>
				right({
					year,
					month,
					promptTokens: 10,
					completionTokens: 5,
					totalTokens: 15,
					limitMillions: 1,
				}),
		} as unknown as AntboxTenant["metricsService"],
		featuresEngine: {} as AntboxTenant["featuresEngine"],
		agentsEngine: {} as AntboxTenant["agentsEngine"],
		workflowInstancesEngine: {} as AntboxTenant["workflowInstancesEngine"],
		...overrides,
	};
}

describe("metrics_handlers", () => {
	it("returns storage metrics when metrics service is available", async () => {
		const handler = getStorageUsageHandler([makeTenant()]);

		const response = await handler(new Request("http://localhost/v2/metrics/storage"));

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ totalGb: 42, limitGb: 1 });
	});

	it("returns service unavailable when storage metrics service is missing", async () => {
		const handler = getStorageUsageHandler([
			makeTenant({ metricsService: undefined as unknown as AntboxTenant["metricsService"] }),
		]);

		const response = await handler(new Request("http://localhost/v2/metrics/storage"));

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({
			error: "metricsService not available for this tenant",
		});
	});

	it("returns token metrics when metrics service is available", async () => {
		const handler = getTokenUsageHandler([makeTenant()]);

		const response = await handler(
			new Request("http://localhost/v2/metrics/tokens?year=2026&month=3"),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			year: 2026,
			month: 3,
			promptTokens: 10,
			completionTokens: 5,
			totalTokens: 15,
			limitMillions: 1,
		});
	});

	it("returns service unavailable when token metrics service is missing", async () => {
		const handler = getTokenUsageHandler([
			makeTenant({ metricsService: undefined as unknown as AntboxTenant["metricsService"] }),
		]);

		const response = await handler(
			new Request("http://localhost/v2/metrics/tokens?year=2026&month=3"),
		);

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({
			error: "metricsService not available for this tenant",
		});
	});
});
