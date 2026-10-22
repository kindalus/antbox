import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { Users } from "domain/users_groups/users.ts";
import { NotificationsService } from "./notifications_service.ts";

function context(email: string): AuthenticationContext {
	return { tenant: "default", mode: "Direct", principal: { email, groups: ["staff"] } };
}

describe("NotificationsService authentication", () => {
	it("rejects every anonymous operation before accessing storage", async () => {
		const repo = new InMemoryConfigurationRepository();
		const service = new NotificationsService(repo);
		const anonymous = context(Users.ANONYMOUS_USER_EMAIL);
		const payload = { targetUser: "recipient@example.com", title: "Notice", body: "Body" };
		const results = await Promise.all([
			service.critical(anonymous, payload),
			service.info(anonymous, payload),
			service.insight(anonymous, payload),
			service.list(anonymous),
			service.delete(anonymous, ["some-notification"]),
			service.clearAll(anonymous),
		]);
		for (const result of results) {
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) expect(result.value.errorCode).toBe("UnauthorizedError");
		}
		expect((await repo.list("notifications")).right).toHaveLength(0);
	});

	it("preserves authenticated creation, recipient visibility and deletion", async () => {
		const service = new NotificationsService(new InMemoryConfigurationRepository());
		const sender = context("sender@example.com");
		const recipient = context("recipient@example.com");
		for (const priority of ["critical", "info", "insight"] as const) {
			expect((await service[priority](sender, {
				targetUser: recipient.principal.email,
				title: "Notice",
				body: "Body",
			})).isRight()).toBe(true);
		}
		expect((await service.list(sender)).right).toHaveLength(0);
		const messages = (await service.list(recipient)).right;
		expect(messages).toHaveLength(3);
		expect((await service.delete(sender, [messages[0].uuid])).isLeft()).toBe(true);
		expect((await service.delete(recipient, [messages[0].uuid])).isRight()).toBe(true);
		expect((await service.clearAll(recipient)).isRight()).toBe(true);
		expect((await service.list(recipient)).right).toHaveLength(0);
	});
});
