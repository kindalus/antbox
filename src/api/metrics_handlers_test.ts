import { describe, it } from "bdd";
import { expect } from "expect";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { getStorageUsageHandler, getTokenUsageHandler } from "./metrics_handlers.ts";
import { left, right } from "shared/either.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { SignJWT } from "jose";

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
		apiKeysService: {
			getApiKeyBySecret: async (secret: string) =>
				secret === "admin" || secret === "member"
					? right({ group: secret === "admin" ? Groups.ADMINS_GROUP_UUID : "staff" })
					: left(new Error("Invalid API key")),
		} as unknown as AntboxTenant["apiKeysService"],
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

function adminRequest(path: string): Request {
	return new Request(`http://localhost/v2/metrics/${path}`, {
		headers: { Authorization: "ApiKey admin" },
	});
}

describe("metrics_handlers", () => {
	it("returns storage metrics when metrics service is available", async () => {
		const handler = getStorageUsageHandler([makeTenant()]);

		const response = await handler(adminRequest("storage"));

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ totalGb: 42, limitGb: 1 });
	});

	it("returns service unavailable when storage metrics service is missing", async () => {
		const handler = getStorageUsageHandler([
			makeTenant({ metricsService: undefined as unknown as AntboxTenant["metricsService"] }),
		]);

		const response = await handler(adminRequest("storage"));

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({
			error: "metricsService not available for this tenant",
		});
	});

	it("returns token metrics when metrics service is available", async () => {
		const handler = getTokenUsageHandler([makeTenant()]);

		const response = await handler(
			adminRequest("tokens?year=2026&month=3"),
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
			adminRequest("tokens?year=2026&month=3"),
		);

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({
			error: "metricsService not available for this tenant",
		});
	});

	for (
		const [path, createHandler] of [
			["storage", getStorageUsageHandler],
			["tokens?year=2026&month=3", getTokenUsageHandler],
		] as const
	) {
		it(`rejects anonymous and non-admin ${path} requests before calling the service`, async () => {
			let calls = 0;
			const failIfCalled = () => {
				calls++;
				throw new Error("Unauthorized metrics lookup");
			};
			const handler = createHandler([makeTenant({
				metricsService: {
					getStorageUsage: failIfCalled,
					getTokenUsage: failIfCalled,
				} as unknown as AntboxTenant["metricsService"],
			})]);
			for (const authorization of [undefined, "ApiKey member", "ApiKey invalid"]) {
				const headers = new Headers({
					"X-Principal": JSON.stringify({ email: "root", groups: [Groups.ADMINS_GROUP_UUID] }),
				});
				if (authorization) headers.set("Authorization", authorization);
				const response = await handler(
					new Request(`http://localhost/v2/metrics/${path}`, { headers }),
				);
				expect(response.status).toBe(403);
				await response.body?.cancel();
			}
			expect(calls).toBe(0);
		});

		it(`allows tenant root to read ${path}`, async () => {
			const tenant = makeTenant();
			const token = await new SignJWT({})
				.setProtectedHeader({ alg: "HS256" })
				.setIssuer("urn:antbox")
				.setAudience(tenant.name)
				.setExpirationTime("1h")
				.sign(new TextEncoder().encode(tenant.symmetricKey));
			const response = await createHandler([tenant])(
				new Request(`http://localhost/v2/metrics/${path}`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
			);
			expect(response.status).toBe(200);
			await response.body?.cancel();
		});
	}
});
