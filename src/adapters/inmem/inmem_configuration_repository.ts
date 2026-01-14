import type { AntboxError } from "shared/antbox_error.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type {
	CollectionMap,
	ConfigurationRepository,
} from "domain/configuration/configuration_repository.ts";

/**
 * In-memory ConfigurationRepository for tests or ephemeral usage.
 *
 * @remarks
 * External setup: none.
 *
 * @example
 * const repo = new InMemoryConfigurationRepository();
 */
export class InMemoryConfigurationRepository implements ConfigurationRepository {
	private collections: {
		groups: Map<string, CollectionMap["groups"]>;
		users: Map<string, CollectionMap["users"]>;
		apikeys: Map<string, CollectionMap["apikeys"]>;
		aspects: Map<string, CollectionMap["aspects"]>;
		workflows: Map<string, CollectionMap["workflows"]>;
		workflowInstances: Map<string, CollectionMap["workflowInstances"]>;
		agents: Map<string, CollectionMap["agents"]>;
		features: Map<string, CollectionMap["features"]>;
		notifications: Map<string, CollectionMap["notifications"]>;
		skills: Map<string, CollectionMap["skills"]>;
	};

	constructor() {
		this.collections = {
			groups: new Map(),
			users: new Map(),
			apikeys: new Map(),
			aspects: new Map(),
			workflows: new Map(),
			workflowInstances: new Map(),
			agents: new Map(),
			features: new Map(),
			notifications: new Map(),
			skills: new Map(),
		};
	}

	async save<K extends keyof CollectionMap>(
		collection: K,
		data: CollectionMap[K],
	): Promise<Either<AntboxError, CollectionMap[K]>> {
		const collectionMap = this.collections[collection] as Map<string, CollectionMap[K]>;

		// Determine the key based on collection type
		// For users, the key is email; for others, it's uuid
		const key = collection === "users"
			? (data as { email: string }).email
			: (data as { uuid: string }).uuid;

		collectionMap.set(key, data);

		return right(data);
	}

	async get<K extends keyof CollectionMap>(
		collection: K,
		uuid: string,
	): Promise<Either<AntboxError, CollectionMap[K]>> {
		const collectionMap = this.collections[collection] as Map<string, CollectionMap[K]>;
		const item = collectionMap.get(uuid);

		if (!item) {
			return left(
				new BadRequestError(`${String(collection)} with uuid '${uuid}' not found`),
			);
		}

		return right(item);
	}

	async list<K extends keyof CollectionMap>(
		collection: K,
	): Promise<Either<AntboxError, CollectionMap[K][]>> {
		const collectionMap = this.collections[collection] as Map<string, CollectionMap[K]>;
		const items = Array.from(collectionMap.values());

		return right(items);
	}

	async delete<K extends keyof CollectionMap>(
		collection: K,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		const collectionMap = this.collections[collection] as Map<string, CollectionMap[K]>;

		if (!collectionMap.has(uuid)) {
			return left(
				new BadRequestError(`${String(collection)} with uuid '${uuid}' not found`),
			);
		}

		collectionMap.delete(uuid);

		return right(undefined);
	}
}
