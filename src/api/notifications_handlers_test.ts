import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { NotificationsService } from "application/notifications/notifications_service.ts";
import { right } from "shared/either.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import {
	deleteNotificationsHandler,
	sendCriticalNotificationHandler,
	sendInfoNotificationHandler,
	sendInsightNotificationHandler,
} from "./notifications_handlers.ts";

function fixture() {
	const repo = new InMemoryConfigurationRepository();
	const tenant = {
		name: "default",
		symmetricKey: "test-secret",
		apiKeysService: { getApiKeyBySecret: () => Promise.resolve(right({ group: "staff" })) },
		externalLoginService: {},
		notificationsService: new NotificationsService(repo),
	} as unknown as AntboxTenant;
	return { repo, tenant };
}

function request(body: string, authenticated = true) {
	return new Request("http://localhost/notifications", {
		method: "POST",
		body,
		headers: {
			"Content-Type": "application/json",
			...(authenticated ? { Authorization: "ApiKey test" } : {}),
		},
	});
}

describe("notification request boundaries", () => {
	it("blocks anonymous sends and preserves authenticated sends at every priority", async () => {
		for (
			const factory of [
				sendCriticalNotificationHandler,
				sendInfoNotificationHandler,
				sendInsightNotificationHandler,
			]
		) {
			const { repo, tenant } = fixture();
			const body = JSON.stringify({
				targetUser: "user@example.com",
				title: "Notice",
				body: "Hello",
			});
			expect((await factory([tenant])(request(body, false))).status).toBe(401);
			expect((await repo.list("notifications")).right).toHaveLength(0);
			expect((await factory([tenant])(request(body))).status).toBe(201);
			expect((await repo.list("notifications")).right).toHaveLength(1);
		}
	});

	it("returns 400 for malformed JSON and invalid fields without persistence", async () => {
		const { repo, tenant } = fixture();
		for (
			const factory of [
				sendCriticalNotificationHandler,
				sendInfoNotificationHandler,
				sendInsightNotificationHandler,
			]
		) {
			for (
				const body of ["{", "null", "[]", '{"title":{},"body":"Hello","targetGroup":"staff"}']
			) {
				expect((await factory([tenant])(request(body))).status).toBe(400);
			}
		}
		for (const body of ["{", "null", '{"uuids":[{}]}', '{"uuids":[]}']) {
			expect((await deleteNotificationsHandler([tenant])(request(body))).status).toBe(400);
		}
		expect((await repo.list("notifications")).right).toHaveLength(0);
	});
});
