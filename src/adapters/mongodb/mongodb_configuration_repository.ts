import { type Filter, MongoClient } from "mongodb";

import type {
	CollectionMap,
	ConfigurationRepository,
} from "domain/configuration/configuration_repository.ts";
import { AntboxError, BadRequestError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

interface ConfigDocument {
	_id: string;
	[key: string]: unknown;
}

export class MongodbConfigurationError extends AntboxError {
	static ERROR_CODE = "MongodbConfigurationError";
	constructor(message: string) {
		super(MongodbConfigurationError.ERROR_CODE, message);
	}
}

/**
 * Builds a MongoDB-backed ConfigurationRepository.
 *
 * @remarks
 * External setup:
 * - Start a MongoDB server and create a database/user with read/write access.
 * - Ensure the process can reach MongoDB (`--allow-net` in Deno).
 *
 * @example
 * const repoOrErr = await buildMongodbConfigurationRepository(
 *   "mongodb://localhost:27017",
 *   "antbox",
 * );
 * if (repoOrErr.isRight()) {
 *   const repo = repoOrErr.value;
 * }
 */
export default function buildMongodbConfigurationRepository(
	url: string,
	dbname: string,
): Promise<Either<AntboxError, ConfigurationRepository>> {
	return new MongoClient(url)
		.connect()
		.then((client) => new MongodbConfigurationRepository(client, dbname))
		.then((repo) => right(repo))
		.catch((err) => left(new UnknownError(err.message))) as Promise<
			Either<AntboxError, ConfigurationRepository>
		>;
}

export class MongodbConfigurationRepository implements ConfigurationRepository {
	readonly #client: MongoClient;
	readonly #db: string;

	constructor(client: MongoClient, dbname: string) {
		this.#client = client;
		this.#db = dbname;
	}

	#getCollectionName(collection: keyof CollectionMap): string {
		return `config_${collection}`;
	}

	#getCollection(collection: keyof CollectionMap) {
		const collectionName = this.#getCollectionName(collection);
		return this.#client.db(this.#db).collection<ConfigDocument>(collectionName);
	}

	#getKey<K extends keyof CollectionMap>(
		collection: K,
		data: CollectionMap[K],
	): string {
		if (collection === "users") {
			return (data as { email: string }).email;
		}
		return (data as { uuid: string }).uuid;
	}

	async save<K extends keyof CollectionMap>(
		collection: K,
		data: CollectionMap[K],
	): Promise<Either<AntboxError, CollectionMap[K]>> {
		try {
			const coll = this.#getCollection(collection);
			const key = this.#getKey(collection, data);

			await coll.updateOne(
				{ _id: key } as Filter<ConfigDocument>,
				{ $set: { ...data, _id: key } as ConfigDocument },
				{ upsert: true },
			);

			return right(data);
		} catch (err) {
			const error = err as Error;
			return left(new MongodbConfigurationError(error.message));
		}
	}

	async get<K extends keyof CollectionMap>(
		collection: K,
		uuid: string,
	): Promise<Either<AntboxError, CollectionMap[K]>> {
		try {
			const coll = this.#getCollection(collection);

			const doc = await coll.findOne({ _id: uuid } as Filter<ConfigDocument>);

			if (!doc) {
				return left(
					new BadRequestError(`${String(collection)} with uuid '${uuid}' not found`),
				);
			}

			// Remove MongoDB _id before returning
			const { _id: _, ...data } = doc;
			return right(data as unknown as CollectionMap[K]);
		} catch (err) {
			const error = err as Error;
			return left(new MongodbConfigurationError(error.message));
		}
	}

	async list<K extends keyof CollectionMap>(
		collection: K,
	): Promise<Either<AntboxError, CollectionMap[K][]>> {
		try {
			const coll = this.#getCollection(collection);

			const docs = await coll.find({}).toArray();

			// Remove MongoDB _id from each document
			const items = docs.map((doc) => {
				const { _id: _, ...data } = doc;
				return data as unknown as CollectionMap[K];
			});

			return right(items);
		} catch (err) {
			const error = err as Error;
			return left(new MongodbConfigurationError(error.message));
		}
	}

	async delete<K extends keyof CollectionMap>(
		collection: K,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		try {
			const coll = this.#getCollection(collection);

			const result = await coll.deleteOne({ _id: uuid } as Filter<ConfigDocument>);

			if (result.deletedCount === 0) {
				return left(
					new BadRequestError(`${String(collection)} with uuid '${uuid}' not found`),
				);
			}

			return right(undefined);
		} catch (err) {
			const error = err as Error;
			return left(new MongodbConfigurationError(error.message));
		}
	}

	async close(): Promise<void> {
		await this.#client.close();
	}
}
