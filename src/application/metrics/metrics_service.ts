import type { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import type { StorageUsageMetrics, TokenUsageMetrics } from "domain/metrics/tenant_metrics.ts";

export class MetricsService {
	readonly #nodeRepository: NodeRepository;
	readonly #eventStore: EventStoreRepository;

	constructor(nodeRepository: NodeRepository, eventStore: EventStoreRepository) {
		this.#nodeRepository = nodeRepository;
		this.#eventStore = eventStore;
	}

	async getStorageUsage(): Promise<Either<AntboxError, StorageUsageMetrics>> {
		const sizeOrErr = await this.#nodeRepository.aggregateTotalSize();
		if (sizeOrErr.isLeft()) {
			return left(sizeOrErr.value);
		}
		return right({ totalBytes: sizeOrErr.value });
	}

	async getTokenUsage(
		year: number,
		month: number,
	): Promise<Either<AntboxError, TokenUsageMetrics>> {
		const metrics: TokenUsageMetrics = {
			year,
			month,
			promptTokens: 0,
			completionTokens: 0,
			totalTokens: 0,
		};

		// 1. Fetch agent usage
		const agentStreamsOrErr = await this.#eventStore.getStreamsByMimetype(
			"application/vnd.antbox.agent-usage",
		);
		if (agentStreamsOrErr.isRight()) {
			this.#aggregateTokens(metrics, agentStreamsOrErr.value, year, month);
		}

		// 2. Fetch embeddings usage
		const embedStreamsOrErr = await this.#eventStore.getStreamsByMimetype(
			"application/vnd.antbox.embeddings-usage",
		);
		if (embedStreamsOrErr.isRight()) {
			this.#aggregateTokens(metrics, embedStreamsOrErr.value, year, month);
		}

		return right(metrics);
	}

	#aggregateTokens(
		metrics: TokenUsageMetrics,
		streams: Map<string, import("domain/audit/audit_event.ts").AuditEvent[]>,
		year: number,
		month: number,
	): void {
		for (const streamEvents of streams.values()) {
			for (const event of streamEvents) {
				const date = new Date(event.occurredOn);
				if (date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const payload = event.payload as any;
					if (payload?.usage) {
						metrics.promptTokens += payload.usage.promptTokens ?? 0;
						metrics.completionTokens += payload.usage.completionTokens ?? 0;
						metrics.totalTokens += payload.usage.totalTokens ?? 0;
					}
				}
			}
		}
	}
}
