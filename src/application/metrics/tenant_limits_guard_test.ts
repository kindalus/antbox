import { assert, assertEquals } from "jsr:@std/assert@0.224.0";
import type { AuditEvent } from "domain/audit/audit_event.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import type { TenantLimits } from "domain/metrics/tenant_limits.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { right } from "shared/either.ts";
import { ForbiddenError } from "shared/antbox_error.ts";
import { TenantLimitsGuard } from "./tenant_limits_guard.ts";

function createGuard(overrides: {
	nodeRepository?: NodeRepository;
	eventStore?: EventStoreRepository;
	tenantLimits?: TenantLimits;
} = {}) {
	return new TenantLimitsGuard(
		overrides.nodeRepository ?? {
			aggregateTotalSize: () => Promise.resolve(right(0)),
		} as unknown as NodeRepository,
		overrides.eventStore ?? {
			getStreamsByMimetype: () => Promise.resolve(right(new Map())),
		} as unknown as EventStoreRepository,
		overrides.tenantLimits ?? {
			storage: 1,
			tokens: 1,
		},
	);
}

function createUsageEvent(occurredOn: string, totalTokens: number): AuditEvent {
	return {
		streamId: "stream-1",
		sequence: 1,
		eventType: "AgentInteractionCompletedEvent",
		userEmail: "test@example.com",
		occurredOn,
		payload: {
			usage: {
				promptTokens: totalTokens,
				completionTokens: 0,
				totalTokens,
			},
		},
	};
}

Deno.test("TenantLimitsGuard", async (t) => {
	await t.step("blocks file creation at storage limit plus buffer", async () => {
		const guard = createGuard({
			nodeRepository: {
				aggregateTotalSize: () => Promise.resolve(right(1_049_999_999)),
			} as unknown as NodeRepository,
		});

		const result = await guard.ensureCanCreateFile(1);

		assert(result.isLeft());
		assert(result.value instanceof ForbiddenError);
		assertEquals(result.value.message, "Storage limit exceeded for this tenant");
	});

	await t.step("allows file update that reduces usage below storage threshold", async () => {
		const guard = createGuard({
			nodeRepository: {
				aggregateTotalSize: () => Promise.resolve(right(1_060_000_000)),
			} as unknown as NodeRepository,
		});

		const result = await guard.ensureCanUpdateFile(100_000_000, 80_000_000);

		assert(result.isRight());
	});

	await t.step("skips storage enforcement for pay-as-you-go", async () => {
		const guard = createGuard({
			nodeRepository: {
				aggregateTotalSize: () => Promise.resolve(right(9_000_000_000)),
			} as unknown as NodeRepository,
			tenantLimits: {
				storage: "pay-as-you-go",
				tokens: 1,
			},
		});

		const result = await guard.ensureCanCreateFile(9_000_000_000);

		assert(result.isRight());
	});

	await t.step("blocks agent execution at token limit plus buffer", async () => {
		const guard = createGuard({
			eventStore: {
				getStreamsByMimetype: () =>
					Promise.resolve(right(
						new Map([
							["agent-1", [createUsageEvent("2026-03-10T10:00:00Z", 1_050_000)]],
						]),
					)),
			} as unknown as EventStoreRepository,
		});

		const result = await guard.ensureCanRunAgent(new Date("2026-03-21T12:00:00Z"));

		assert(result.isLeft());
		assert(result.value instanceof ForbiddenError);
		assertEquals(result.value.message, "Agent token limit exceeded for the current month");
	});

	await t.step("counts only the current month for agent execution limits", async () => {
		const guard = createGuard({
			eventStore: {
				getStreamsByMimetype: () =>
					Promise.resolve(right(
						new Map([
							["agent-1", [
								createUsageEvent("2026-02-28T23:59:59Z", 10_000_000),
								createUsageEvent("2026-03-10T10:00:00Z", 1_049_999),
							]],
						]),
					)),
			} as unknown as EventStoreRepository,
		});

		const result = await guard.ensureCanRunAgent(new Date("2026-03-21T12:00:00Z"));

		assert(result.isRight());
	});

	await t.step("skips token enforcement for pay-as-you-go", async () => {
		const guard = createGuard({
			eventStore: {
				getStreamsByMimetype: () =>
					Promise.resolve(right(
						new Map([
							["agent-1", [createUsageEvent("2026-03-10T10:00:00Z", 99_000_000)]],
						]),
					)),
			} as unknown as EventStoreRepository,
			tenantLimits: {
				storage: 1,
				tokens: "pay-as-you-go",
			},
		});

		const result = await guard.ensureCanRunAgent(new Date("2026-03-21T12:00:00Z"));

		assert(result.isRight());
	});
});
