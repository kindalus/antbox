import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import type { TenantLimits } from "domain/metrics/tenant_limits.ts";
import { type AntboxError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

const STORAGE_BYTES_PER_GB = 1_000_000_000;
const TOKENS_PER_MILLION = 1_000_000;
const LIMIT_BUFFER_MULTIPLIER = 1.05;
const AGENT_USAGE_MIMETYPE = "application/vnd.antbox.agent-usage";

export interface TenantLimitsEnforcer {
	ensureCanCreateFile(fileSize: number): Promise<Either<AntboxError, void>>;
	ensureCanUpdateFile(
		currentFileSize: number,
		newFileSize: number,
	): Promise<Either<AntboxError, void>>;
	ensureCanRunAgent(now?: Date): Promise<Either<AntboxError, void>>;
}

export class TenantLimitsGuard implements TenantLimitsEnforcer {
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

	async ensureCanCreateFile(fileSize: number): Promise<Either<AntboxError, void>> {
		if (this.#tenantLimits.storage === "pay-as-you-go") {
			return right(undefined);
		}

		const currentUsageOrErr = await this.#nodeRepository.aggregateTotalSize();
		if (currentUsageOrErr.isLeft()) {
			return left(currentUsageOrErr.value);
		}

		return this.#ensureStorageWithinLimit(currentUsageOrErr.value + fileSize);
	}

	async ensureCanUpdateFile(
		currentFileSize: number,
		newFileSize: number,
	): Promise<Either<AntboxError, void>> {
		if (this.#tenantLimits.storage === "pay-as-you-go") {
			return right(undefined);
		}

		const currentUsageOrErr = await this.#nodeRepository.aggregateTotalSize();
		if (currentUsageOrErr.isLeft()) {
			return left(currentUsageOrErr.value);
		}

		const projectedUsage = Math.max(0, currentUsageOrErr.value - currentFileSize + newFileSize);
		return this.#ensureStorageWithinLimit(projectedUsage);
	}

	async ensureCanRunAgent(now = new Date()): Promise<Either<AntboxError, void>> {
		const tokenLimit = this.#tenantLimits.tokens;
		if (tokenLimit === "pay-as-you-go") {
			return right(undefined);
		}

		const streamsOrErr = await this.#eventStore.getStreamsByMimetype(AGENT_USAGE_MIMETYPE);
		if (streamsOrErr.isLeft()) {
			return left(streamsOrErr.value);
		}

		let totalTokens = 0;
		for (const streamEvents of streamsOrErr.value.values()) {
			for (const event of streamEvents) {
				const occurredOn = new Date(event.occurredOn);
				if (
					occurredOn.getUTCFullYear() !== now.getUTCFullYear() ||
					occurredOn.getUTCMonth() !== now.getUTCMonth()
				) {
					continue;
				}

				const payload = event.payload as {
					usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
				};
				totalTokens += payload.usage?.totalTokens ??
					((payload.usage?.promptTokens ?? 0) + (payload.usage?.completionTokens ?? 0));
			}
		}

		if (totalTokens >= tokenLimit * TOKENS_PER_MILLION * LIMIT_BUFFER_MULTIPLIER) {
			return left(
				new ForbiddenError("Agent token limit exceeded for the current month"),
			);
		}

		return right(undefined);
	}

	#ensureStorageWithinLimit(projectedUsageBytes: number): Either<AntboxError, void> {
		const storageLimit = this.#tenantLimits.storage;
		if (storageLimit === "pay-as-you-go") {
			return right(undefined);
		}

		if (projectedUsageBytes >= storageLimit * STORAGE_BYTES_PER_GB * LIMIT_BUFFER_MULTIPLIER) {
			return left(new ForbiddenError("Storage limit exceeded for this tenant"));
		}

		return right(undefined);
	}
}
