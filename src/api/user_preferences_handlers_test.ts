import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { UserPreferencesService } from "application/preferences/user_preferences_service.ts";
import { right } from "shared/either.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import {
	createUserPreferencesHandler,
	getUserPreferencesHandler,
	updateUserPreferencesHandler,
} from "./user_preferences_handlers.ts";

describe("user preferences request boundaries", () => {
	function fixture(): AntboxTenant {
		return {
			name: "default",
			symmetricKey: "test-secret",
			externalLoginService: {},
			apiKeysService: { getApiKeyBySecret: () => Promise.resolve(right({ group: "staff" })) },
			userPreferencesService: new UserPreferencesService(new InMemoryConfigurationRepository()),
		} as unknown as AntboxTenant;
	}
	function request(body: string, authenticated = true) {
		return new Request("http://localhost/user-preferences", {
			method: "POST",
			body,
			headers: {
				"Content-Type": "application/json",
				...(authenticated ? { Authorization: "ApiKey test" } : {}),
			},
		});
	}

	it("rejects malformed JSON and non-object preferences", async () => {
		for (const factory of [createUserPreferencesHandler, updateUserPreferencesHandler]) {
			const handler = factory([fixture()]);
			for (const body of ["{", "null", "[]", '{"preferences":[]}', '{"preferences":null}']) {
				expect((await handler(request(body))).status).toBe(400);
			}
		}
	});

	it("rejects anonymous writes and reads while preserving authenticated preferences", async () => {
		const tenant = fixture();
		for (const factory of [createUserPreferencesHandler, updateUserPreferencesHandler]) {
			expect(
				(await factory([tenant])(request('{"preferences":{"theme":"dark"}}', false))).status,
			).toBe(401);
		}
		expect(
			(await getUserPreferencesHandler([tenant])(
				new Request("http://localhost/user-preferences"),
			)).status,
		).toBe(401);
		expect(
			(await createUserPreferencesHandler([tenant])(request('{"preferences":{"theme":"dark"}}')))
				.status,
		).toBe(201);
		const response = await getUserPreferencesHandler([tenant])(
			new Request("http://localhost/user-preferences", {
				headers: { Authorization: "ApiKey test" },
			}),
		);
		expect(response.status).toBe(200);
		expect((await response.json()).preferences).toEqual({ theme: "dark" });
	});
});
