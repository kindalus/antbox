import type { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import type { TokenUsage } from "domain/ai/chat_message.ts";
import { quotaTokens } from "domain/metrics/quota_tokens.ts";
import type {
	SourceTokenUsage,
	StorageUsageMetrics,
	TokenUsageMetrics,
} from "domain/metrics/tenant_metrics.ts";
import type { TenantLimits } from "domain/metrics/tenant_limits.ts";

const BYTES_PER_GB = 1_000_000_000;
const AGENT_USAGE_MIMETYPE = "application/vnd.antbox.agent-usage";
const EMBEDDINGS_USAGE_MIMETYPE = "application/vnd.antbox.embeddings-usage";
const OCR_USAGE_MIMETYPE = "application/vnd.antbox.ocr-usage";

export class MetricsService {
	readonly #nodeRepository: NodeRepository;
	readonly #eventStore: EventStoreRepository;
	readonly #tenantLimits: TenantLimits;

	constructor(
		nodeRepository: NodeRepository,
		eventStore: EventStoreRepository,
		tenantLimits: TenantLimits,
	) {
		this.#nodeRepository = nodeRepository;
		this.#eventStore = eventStore;
		this.#tenantLimits = tenantLimits;
	}

	async getStorageUsage(): Promise<Either<AntboxError, StorageUsageMetrics>> {
		const sizeOrErr = await this.#nodeRepository.aggregateTotalSize();
		if (sizeOrErr.isLeft()) {
			return left(sizeOrErr.value);
		}
		return right({
			totalGb: sizeOrErr.value / BYTES_PER_GB,
			limitGb: this.#tenantLimits.storage,
		});
	}

	getLimits(): TenantLimits {
		return { ...this.#tenantLimits };
	}

	async getTokenUsage(
		year: number,
		month: number,
	): Promise<Either<AntboxError, TokenUsageMetrics>> {
		const agentsOrErr = await this.#monthlyUsage(AGENT_USAGE_MIMETYPE, year, month);
		if (agentsOrErr.isLeft()) return left(agentsOrErr.value);

		const embeddingsOrErr = await this.#monthlyUsage(EMBEDDINGS_USAGE_MIMETYPE, year, month);
		if (embeddingsOrErr.isLeft()) return left(embeddingsOrErr.value);

		const ocrOrErr = await this.#monthlyUsage(OCR_USAGE_MIMETYPE, year, month);
		if (ocrOrErr.isLeft()) return left(ocrOrErr.value);

		const agents = sumUsage(agentsOrErr.value);
		const embeddings = sumUsage(embeddingsOrErr.value);
		const ocr = sumUsage(ocrOrErr.value);

		return right({
			year,
			month,
			promptTokens: agents.promptTokens + embeddings.promptTokens + ocr.promptTokens,
			completionTokens: agents.completionTokens + embeddings.completionTokens +
				ocr.completionTokens,
			totalTokens: agents.totalTokens + embeddings.totalTokens + ocr.totalTokens,
			quotaTokens: agentsOrErr.value.reduce((sum, usage) => sum + quotaTokens(usage), 0),
			limitMillions: this.#tenantLimits.tokens,
			agents,
			embeddings,
			ocr,
		});
	}

	async #monthlyUsage(
		mimetype: string,
		year: number,
		month: number,
	): Promise<Either<AntboxError, Partial<TokenUsage>[]>> {
		const streamsOrErr = await this.#eventStore.getStreamsByMimetype(mimetype);
		if (streamsOrErr.isLeft()) return left(streamsOrErr.value);

		const usages: Partial<TokenUsage>[] = [];
		for (const streamEvents of streamsOrErr.value.values()) {
			for (const event of streamEvents) {
				const date = new Date(event.occurredOn);
				const { usage } = event.payload as { usage?: Partial<TokenUsage> };
				if (usage && date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month) {
					usages.push(usage);
				}
			}
		}
		return right(usages);
	}
}

function sumUsage(usages: Partial<TokenUsage>[]): SourceTokenUsage {
	return usages.reduce<SourceTokenUsage>(
		(sum, usage) => ({
			promptTokens: sum.promptTokens + (usage.promptTokens ?? 0),
			completionTokens: sum.completionTokens + (usage.completionTokens ?? 0),
			totalTokens: sum.totalTokens + (usage.totalTokens ?? 0),
			cacheReadTokens: sum.cacheReadTokens + (usage.cacheReadTokens ?? 0),
			cacheWriteTokens: sum.cacheWriteTokens + (usage.cacheWriteTokens ?? 0),
		}),
		{
			promptTokens: 0,
			completionTokens: 0,
			totalTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		},
	);
}
