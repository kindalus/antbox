import { expect } from "expect";
import { describe, it } from "bdd";
import { left, right } from "shared/either.ts";
import { MetricsService } from "./metrics_service.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import type { AuditEvent } from "domain/audit/audit_event.ts";
import type { TenantLimits } from "domain/metrics/tenant_limits.ts";
import { AntboxError } from "shared/antbox_error.ts";

const tenantLimits: TenantLimits = {
	storage: 25,
	tokens: 3,
};

describe("MetricsService", () => {
	describe("getStorageUsage", () => {
		it("returns aggregated total size in gigabytes", async () => {
			const mockNodeRepo = {
				aggregateTotalSize: () => Promise.resolve(right(1_500_000_000)),
			} as unknown as NodeRepository;

			const service = new MetricsService(
				mockNodeRepo,
				{} as EventStoreRepository,
				tenantLimits,
			);
			const result = await service.getStorageUsage();

			expect(result.isRight()).toBeTruthy();
			if (result.isRight()) {
				expect(result.value.totalGb).toEqual(1.5);
				expect(result.value.limitGb).toEqual(25);
			}
		});

		it("returns error if repository fails", async () => {
			const mockNodeRepo = {
				aggregateTotalSize: () =>
					Promise.resolve(left(new AntboxError("DatabaseError", "DB Error"))),
			} as unknown as NodeRepository;

			const service = new MetricsService(
				mockNodeRepo,
				{} as EventStoreRepository,
				tenantLimits,
			);
			const result = await service.getStorageUsage();

			expect(result.isLeft()).toBeTruthy();
			if (result.isLeft()) {
				expect(result.value.message).toEqual("DB Error");
			}
		});
	});

	describe("getTokenUsage", () => {
		it(
			"propagates either usage source failure instead of reporting partial totals",
			async () => {
				for (
					const failedType of [
						"application/vnd.antbox.agent-usage",
						"application/vnd.antbox.embeddings-usage",
						"application/vnd.antbox.ocr-usage",
					]
				) {
					const failure = new AntboxError("DatabaseError", "Usage database unavailable");
					const store = {
						getStreamsByMimetype: (mimetype: string) =>
							Promise.resolve(
								mimetype === failedType
									? left(failure)
									: right(new Map<string, AuditEvent[]>()),
							),
					} as EventStoreRepository;
					const result = await new MetricsService({} as NodeRepository, store, tenantLimits)
						.getTokenUsage(2026, 3);
					expect(result.isLeft()).toBeTruthy();
					expect(result.value).toEqual(failure);
				}
			},
		);

		it("reports usage by source and the value compared with the quota", async () => {
			const event = (usage: Record<string, number>): AuditEvent => ({
				streamId: "any",
				sequence: 0,
				eventType: "any",
				userEmail: "test@test.com",
				occurredOn: "2026-03-10T00:00:00.000Z",
				payload: { usage },
			});
			const byMimetype: Record<string, AuditEvent[]> = {
				"application/vnd.antbox.agent-usage": [event({
					promptTokens: 1_000,
					completionTokens: 50,
					totalTokens: 1_050,
					cacheReadTokens: 900,
					cacheWriteTokens: 80,
				})],
				"application/vnd.antbox.embeddings-usage": [
					event({ promptTokens: 20, completionTokens: 0, totalTokens: 20 }),
				],
				"application/vnd.antbox.ocr-usage": [
					event({ promptTokens: 30, completionTokens: 12, totalTokens: 42 }),
				],
			};
			const store = {
				getStreamsByMimetype: (mimetype: string) =>
					Promise.resolve(right(new Map([["any", byMimetype[mimetype]]]))),
			} as EventStoreRepository;

			const result = await new MetricsService({} as NodeRepository, store, tenantLimits)
				.getTokenUsage(2026, 3);

			if (result.isLeft()) throw result.value;
			expect(result.value.totalTokens).toEqual(1_112);
			expect(result.value.quotaTokens).toEqual(150);
			expect(result.value.agents).toEqual({
				promptTokens: 1_000,
				completionTokens: 50,
				totalTokens: 1_050,
				cacheReadTokens: 900,
				cacheWriteTokens: 80,
			});
			expect(result.value.embeddings.totalTokens).toEqual(20);
			expect(result.value.ocr.totalTokens).toEqual(42);
		});

		it("includes OCR usage in the monthly totals", async () => {
			const ocrEvent: AuditEvent = {
				streamId: "node-1",
				sequence: 0,
				eventType: "OcrCompletedEvent",
				userEmail: "system",
				occurredOn: "2026-03-10T00:00:00.000Z",
				payload: { usage: { promptTokens: 30, completionTokens: 12, totalTokens: 42 } },
			};
			const store = {
				getStreamsByMimetype: (mimetype: string) =>
					Promise.resolve(right(
						new Map(
							mimetype === "application/vnd.antbox.ocr-usage"
								? [["node-1", [ocrEvent]]]
								: [],
						),
					)),
			} as EventStoreRepository;

			const result = await new MetricsService({} as NodeRepository, store, tenantLimits)
				.getTokenUsage(2026, 3);

			if (result.isLeft()) throw result.value;
			expect(result.value.promptTokens).toEqual(30);
			expect(result.value.completionTokens).toEqual(12);
			expect(result.value.totalTokens).toEqual(42);
		});

		it("aggregates tokens correctly for target month", async () => {
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

			expect(result.isRight()).toBeTruthy();
			if (result.isRight()) {
				expect(result.value.promptTokens).toEqual(30);
				expect(result.value.completionTokens).toEqual(5);
				expect(result.value.totalTokens).toEqual(35);
				expect(result.value.year).toEqual(2026);
				expect(result.value.month).toEqual(3);
				expect(result.value.limitMillions).toEqual(3);
			}
		});
	});

	it("getLimits", async () => {
		const service = new MetricsService(
			{} as NodeRepository,
			{} as EventStoreRepository,
			tenantLimits,
		);

		expect(service.getLimits()).toEqual(tenantLimits);
	});
});
