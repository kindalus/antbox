import { expect } from "expect";
import { InMemoryConfigurationRepository } from "./inmem_configuration_repository.ts";
import type { UserData } from "domain/configuration/user_data.ts";

Deno.test("in-memory configuration saves a snapshot of user groups", async () => {
	const repository = new InMemoryConfigurationRepository();
	const user: UserData = {
		email: "user@example.com",
		title: "User",
		group: "editors",
		groups: ["editors"],
		hasWhatsapp: false,
		active: true,
		createdTime: "2026-01-01T00:00:00.000Z",
		modifiedTime: "2026-01-01T00:00:00.000Z",
	};
	const saved = await repository.save("users", user);
	expect(saved.isRight()).toBe(true);
	user.groups.push("admins");
	saved.right.groups.push("other");
	expect((await repository.get("users", user.email)).right.groups).toEqual(["editors"]);
});

Deno.test("in-memory configuration reads return detached nested preferences", async () => {
	const repository = new InMemoryConfigurationRepository();
	const preferences = {
		email: "user@example.com",
		preferences: { layout: { panels: ["files"] } },
	};
	const expected = structuredClone(preferences);
	expect((await repository.save("userPreferences", preferences)).isRight()).toBe(true);
	const first = (await repository.get("userPreferences", preferences.email)).right;
	(first.preferences.layout as { panels: string[] }).panels.push("admin");
	const listed = (await repository.list("userPreferences")).right;
	expect(listed).toEqual([expected]);
	(listed[0].preferences.layout as { panels: string[] }).panels.push("settings");
	listed.pop();
	expect((await repository.get("userPreferences", preferences.email)).right).toEqual(expected);
});

Deno.test("in-memory configuration rejects uncloneable saves without changing stored state", async () => {
	const repository = new InMemoryConfigurationRepository();
	const preferences = { email: "user@example.com", preferences: { nested: { theme: "dark" } } };
	expect((await repository.save("userPreferences", preferences)).isRight()).toBe(true);
	for (const email of [preferences.email, "new@example.com"]) {
		const saved = await repository.save("userPreferences", {
			email,
			preferences: { uncloneable: () => {} },
		});
		expect(saved.isLeft()).toBe(true);
	}
	expect((await repository.list("userPreferences")).right).toEqual([preferences]);
});
