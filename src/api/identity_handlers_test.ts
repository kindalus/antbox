import { describe, it } from "bdd";
import { expect } from "expect";
import { right } from "shared/either.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { createUserHandler, updateUserHandler } from "./users_handlers.ts";
import { createGroupHandler } from "./groups_handlers.ts";
import { createApiKeyHandler } from "./api_keys_handlers.ts";

function fixture() {
	const calls: unknown[][] = [];
	const call = (...args: unknown[]) => {
		calls.push(args);
		return Promise.resolve(right({ uuid: "created" }));
	};
	const tenant = {
		name: "default",
		usersService: { createUser: call, updateUser: call },
		groupsService: { createGroup: call },
		apiKeysService: { createApiKey: call },
	} as unknown as AntboxTenant;
	return { calls, tenant };
}

function request(body: string) {
	return new Request("http://localhost/v2/users", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-params": '{"email":"user@example.com"}',
		},
		body,
	});
}

describe("identity request validation", () => {
	it("rejects malformed and non-object JSON without calling identity services", async () => {
		for (
			const factory of [
				createUserHandler,
				updateUserHandler,
				createGroupHandler,
				createApiKeyHandler,
			]
		) {
			const { calls, tenant } = fixture();
			for (const body of ["{", "null", "[]", '"text"', "42"]) {
				expect((await factory([tenant])(request(body))).status).toBe(400);
			}
			expect(calls).toHaveLength(0);
		}
	});

	it("validates identity field types and preserves valid requests and API key defaults", async () => {
		const cases = [
			{
				factory: createUserHandler,
				invalid: { email: 42 },
				valid: { email: "user@example.com", title: "Test User", group: "editors" },
			},
			{
				factory: updateUserHandler,
				invalid: { active: "false" },
				valid: { title: "Updated User" },
			},
			{
				factory: createGroupHandler,
				invalid: { title: [] },
				valid: { title: "Editors", uuid: "editors" },
			},
			{ factory: createApiKeyHandler, invalid: { group: {} }, valid: { group: "editors" } },
		];
		for (const { factory, invalid, valid } of cases) {
			const { calls, tenant } = fixture();
			expect((await factory([tenant])(request(JSON.stringify(invalid)))).status).toBe(400);
			expect(calls).toHaveLength(0);
			expect((await factory([tenant])(request(JSON.stringify(valid)))).status)
				.toBe(factory === updateUserHandler ? 200 : 201);
			expect(calls).toHaveLength(1);
			if (factory === createApiKeyHandler) {
				expect(calls[0][1]).toEqual({
					title: "API Key",
					group: "editors",
					active: true,
					description: undefined,
				});
			} else {
				expect(calls[0].at(-1)).toEqual(valid);
			}
		}
	});
});
