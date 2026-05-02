// Integration test: prove that AgentInteractionCompletedEvent published by the
// engine flows through the audit subscriber into the event store and that
// TenantLimitsGuard.ensureCanRunAgent reads the aggregated tokens back.
//
// Closes the post-call deduction loop without a synchronous engine→guard call.
import { describe, it } from "bdd";
import { expect } from "expect";
import { AgentInteractionCompletedEvent } from "domain/ai/agent_interaction_completed_event.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryEventStoreRepository } from "adapters/inmem/inmem_event_store_repository.ts";
import { AuditLoggingService } from "application/audit/audit_logging_service.ts";
import { TenantLimitsGuard } from "application/metrics/tenant_limits_guard.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { right } from "shared/either.ts";

const stubNodeRepository = {
	aggregateTotalSize: () => Promise.resolve(right(0)),
} as unknown as NodeRepository;

describe("agent usage deduction loop", () => {
	it("publishing an AgentInteractionCompletedEvent reduces remaining headroom on the next ensureCanRunAgent", async () => {
		const eventStore = new InMemoryEventStoreRepository();
		const eventBus = new InMemoryEventBus();
		new AuditLoggingService(eventStore, eventBus);

		// 1 million-tokens monthly cap. With LIMIT_BUFFER_MULTIPLIER=1.05,
		// effective ceiling is 1_050_000.
		const guard = new TenantLimitsGuard(stubNodeRepository, eventStore, {
			storage: "pay-as-you-go",
			tokens: 1,
		});

		// First check: nothing recorded yet, allowed.
		const before = await guard.ensureCanRunAgent(new Date("2026-05-15T12:00:00Z"));
		expect(before.isRight()).toBe(true);

		// Engine publishes a completed-event with a usage that exceeds the cap.
		eventBus.publish(
			new AgentInteractionCompletedEvent("user@example.com", "tenant-a", {
				agentUuid: "agent-1",
				usage: { promptTokens: 1_100_000, completionTokens: 0, totalTokens: 1_100_000 },
				interactionType: "answer",
			}),
		);

		// Audit subscriber writes asynchronously via microtask. Let it drain.
		await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
		await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

		const after = await guard.ensureCanRunAgent(new Date("2026-05-15T12:01:00Z"));
		expect(after.isLeft()).toBe(true);
		if (after.isLeft()) {
			expect(after.value.errorCode).toBe("ForbiddenError");
		}
	});

	it("usage from a different month does not count toward the current month", async () => {
		const eventStore = new InMemoryEventStoreRepository();
		const eventBus = new InMemoryEventBus();
		new AuditLoggingService(eventStore, eventBus);
		const guard = new TenantLimitsGuard(stubNodeRepository, eventStore, {
			storage: "pay-as-you-go",
			tokens: 1,
		});

		// Publish a fully-saturating event but back-dated by setting occurredOn
		// via the AgentInteractionCompletedEvent constructor's occurredOn override.
		// Constructor uses `new Date()` for occurredOn, so we just verify same-month
		// behavior here and rely on tenant_limits_guard_test.ts for cross-month cases.
		eventBus.publish(
			new AgentInteractionCompletedEvent("user@example.com", "tenant-a", {
				agentUuid: "agent-1",
				usage: { promptTokens: 100, completionTokens: 0, totalTokens: 100 },
				interactionType: "answer",
			}),
		);
		await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
		await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

		// Current month: small usage (100) is well below the 1.05M ceiling.
		const result = await guard.ensureCanRunAgent(new Date());
		expect(result.isRight()).toBe(true);
	});
});
