import { assert, assertEquals } from "jsr:@std/assert@0.224.0";
import { left, right } from "shared/either.ts";
import { MetricsService } from "./metrics_service.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import type { AuditEvent } from "domain/audit/audit_event.ts";
import type { TenantLimits } from "domain/metrics/tenant_limits.ts";

const tenantLimits: TenantLimits = {
	storage: 25,
	tokens: 3,
};

Deno.test("MetricsService", async (t) => {
	await t.step("getStorageUsage", async (t) => {
		await t.step("returns aggregated total size", async () => {
			const mockNodeRepo = {
				aggregateTotalSize: () => Promise.resolve(right(1024)),
			} as unknown as NodeRepository;

			const service = new MetricsService(
				mockNodeRepo,
				{} as EventStoreRepository,
				tenantLimits,
			);
			const result = await service.getStorageUsage();

			assert(result.isRight());
			if (result.isRight()) {
				assertEquals(result.value.totalBytes, 1024);
				assertEquals(result.value.limitGb, 25);
			}
		});

		await t.step("returns error if repository fails", async () => {
			const mockNodeRepo = {
				aggregateTotalSize: () => Promise.resolve(left({ message: "DB Error" } as any)),
			} as unknown as NodeRepository;

			const service = new MetricsService(
				mockNodeRepo,
				{} as EventStoreRepository,
				tenantLimits,
			);
			const result = await service.getStorageUsage();

			assert(result.isLeft());
			if (result.isLeft()) {
				assertEquals(result.value.message, "DB Error");
			}
		});
	});

	await t.step("getTokenUsage", async (t) => {
		await t.step("aggregates tokens correctly for target month", async () => {
			const createEvent = (
				dateStr: string,
				prompt: number,
				completion: number,
			): AuditEvent => ({
				streamId: "any",
				sequence: 1,
				eventType: "any",
				userEmail: "test@test.com",
				occurredOn: dateStr,
				payload: {
					usage: {
						promptTokens: prompt,
						completionTokens: completion,
						totalTokens: prompt + completion,
					},
				},
			});

			const mockEventStore = {
				getStreamsByMimetype: (mimetype: string) => {
					if (mimetype === "application/vnd.antbox.agent-usage") {
						return Promise.resolve(right(
							new Map([
								["stream1", [
									createEvent("2026-03-10T10:00:00Z", 10, 5), // Match
									createEvent("2026-02-10T10:00:00Z", 100, 100), // Ignore (wrong month)
								]],
							]),
						));
					}
					if (mimetype === "application/vnd.antbox.embeddings-usage") {
						return Promise.resolve(right(
							new Map([
								["stream2", [
									createEvent("2026-03-21T10:00:00Z", 20, 0), // Match
									createEvent("2025-03-21T10:00:00Z", 200, 0), // Ignore (wrong year)
								]],
							]),
						));
					}
					return Promise.resolve(right(new Map()));
				},
			} as unknown as EventStoreRepository;

			const service = new MetricsService(
				{} as NodeRepository,
				mockEventStore,
				tenantLimits,
			);
			const result = await service.getTokenUsage(2026, 3);

			assert(result.isRight());
			if (result.isRight()) {
				assertEquals(result.value.promptTokens, 30);
				assertEquals(result.value.completionTokens, 5);
				assertEquals(result.value.totalTokens, 35);
				assertEquals(result.value.year, 2026);
				assertEquals(result.value.month, 3);
				assertEquals(result.value.limitMillions, 3);
			}
		});
	});

	await t.step("getLimits", async () => {
		const service = new MetricsService(
			{} as NodeRepository,
			{} as EventStoreRepository,
			tenantLimits,
		);

		assertEquals(service.getLimits(), tenantLimits);
	});
});
