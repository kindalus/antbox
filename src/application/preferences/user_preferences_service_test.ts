import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { UserPreferencesService } from "./user_preferences_service.ts";
import { Users } from "domain/users_groups/users.ts";

describe("UserPreferencesService", () => {
	const ctx: AuthenticationContext = {
		tenant: "test",
		principal: {
			email: "user@example.com",
			groups: ["--users--"],
		},
		mode: "Action",
	};

	function createService() {
		return new UserPreferencesService(new InMemoryConfigurationRepository());
	}

	it("rejects anonymous preferences reads and mutations", async () => {
		const repo = new InMemoryConfigurationRepository();
		const service = new UserPreferencesService(repo);
		const anonymous = { ...ctx, principal: { email: Users.ANONYMOUS_USER_EMAIL, groups: [] } };
		const results = await Promise.all([
			service.createUserPreferences(anonymous, { preferences: { secret: "private" } }),
			service.updateUserPreferences(anonymous, { preferences: { theme: "dark" } }),
			service.getUserPreferences(anonymous),
			service.getPreference(anonymous, "secret"),
			service.deleteUserPreferences(anonymous),
		]);
		for (const result of results) {
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) expect(result.value.errorCode).toBe("UnauthorizedError");
		}
		expect((await repo.list("userPreferences")).right).toHaveLength(0);
	});

	it("returns empty preferences when no record exists", async () => {
		const service = createService();

		const result = await service.getUserPreferences(ctx);

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value.email).toBe("user@example.com");
			expect(result.value.preferences).toEqual({});
		}
	});

	it("creates user preferences for the authenticated user", async () => {
		const service = createService();

		const result = await service.createUserPreferences(ctx, {
			preferences: { theme: "dark", pageSize: 20 },
		});

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value.email).toBe("user@example.com");
			expect(result.value.preferences).toEqual({ theme: "dark", pageSize: 20 });
		}
	});

	it("rejects creating preferences twice", async () => {
		const service = createService();

		await service.createUserPreferences(ctx, { preferences: { theme: "dark" } });
		const result = await service.createUserPreferences(ctx, { preferences: { theme: "light" } });

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.message).toContain("already exist");
		}
	});

	it("updates preferences with shallow merge and creates when missing", async () => {
		const service = createService();

		const created = await service.updateUserPreferences(ctx, {
			preferences: { theme: "dark" },
		});
		expect(created.isRight()).toBe(true);

		const updated = await service.updateUserPreferences(ctx, {
			preferences: { pageSize: 50 },
		});

		expect(updated.isRight()).toBe(true);
		if (updated.isRight()) {
			expect(updated.value.preferences).toEqual({ theme: "dark", pageSize: 50 });
		}
	});

	it("gets a single preference value", async () => {
		const service = createService();

		await service.updateUserPreferences(ctx, {
			preferences: { locale: "en-US" },
		});

		const result = await service.getPreference(ctx, "locale");

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value).toBe("en-US");
		}
	});

	it("returns not found for missing preference keys", async () => {
		const service = createService();

		await service.updateUserPreferences(ctx, {
			preferences: { theme: "dark" },
		});

		const result = await service.getPreference(ctx, "missing");

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.errorCode).toBe("NotFoundError");
		}
	});

	it("deletes the current user preferences", async () => {
		const service = createService();

		await service.createUserPreferences(ctx, { preferences: { theme: "dark" } });
		const deleted = await service.deleteUserPreferences(ctx);

		expect(deleted.isRight()).toBe(true);

		const result = await service.getUserPreferences(ctx);
		if (result.isRight()) {
			expect(result.value.preferences).toEqual({});
		}
	});
});
