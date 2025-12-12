import { type Either, left, right } from "shared/either.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import type { WorkflowInstance } from "domain/workflows/workflow_instance.ts";
import type { WorkflowInstanceRepository } from "domain/workflows/workflow_instance_repository.ts";
import { type Document, MongoClient, ObjectId } from "mongodb";

type WorkflowInstanceDbModel = Omit<WorkflowInstance, "uuid"> & {
	_id: ObjectId;
};

export class WorkflowInstanceNotFoundError extends AntboxError {
	constructor(uuid: string) {
		super("WorkflowInstanceNotFound", `Workflow instance ${uuid} not found`);
	}
}

export default function buildMongodbWorkflowInstanceRepository(
	url: string,
	dbname: string,
): Promise<Either<AntboxError, WorkflowInstanceRepository>> {
	return new MongoClient(url)
		.connect()
		.then((client) => new MongodbWorkflowInstanceRepository(client, dbname))
		.then((repo) => right(repo))
		.catch((err) => left(new UnknownError(err.message))) as Promise<
			Either<AntboxError, WorkflowInstanceRepository>
		>;
}

export class MongodbWorkflowInstanceRepository
	implements WorkflowInstanceRepository {
	static readonly COLLECTION_NAME = "workflow_instances";

	readonly #db: string;
	readonly #client: MongoClient;

	constructor(client: MongoClient, dbname: string) {
		this.#client = client;
		this.#db = dbname;
	}

	get #collection() {
		return this.#client.db(this.#db).collection(
			MongodbWorkflowInstanceRepository.COLLECTION_NAME,
		);
	}

	async add(instance: WorkflowInstance): Promise<Either<AntboxError, void>> {
		try {
			const doc = this.#toDbModel(instance);
			await this.#collection.insertOne(doc);
			return right(undefined);
		} catch (err) {
			return left(new UnknownError((err as Error).message));
		}
	}

	async getByUuid(
		uuid: string,
	): Promise<Either<AntboxError, WorkflowInstance>> {
		try {
			const doc = await this.#collection.findOne({ _id: toObjectId(uuid) });

			if (!doc) {
				return left(new WorkflowInstanceNotFoundError(uuid));
			}

			return right(this.#fromDbModel(doc));
		} catch (err) {
			return left(new UnknownError((err as Error).message));
		}
	}

	async getByNodeUuid(
		nodeUuid: string,
	): Promise<Either<AntboxError, WorkflowInstance>> {
		try {
			const doc = await this.#collection.findOne({ nodeUuid });

			if (!doc) {
				return left(
					new WorkflowInstanceNotFoundError(`node:${nodeUuid}`),
				);
			}

			return right(this.#fromDbModel(doc));
		} catch (err) {
			return left(new UnknownError((err as Error).message));
		}
	}

	async update(instance: WorkflowInstance): Promise<Either<AntboxError, void>> {
		try {
			const doc = this.#toDbModel(instance);
			const result = await this.#collection.updateOne(
				{ _id: toObjectId(instance.uuid) },
				{ $set: doc },
			);

			if (result.matchedCount === 0) {
				return left(new WorkflowInstanceNotFoundError(instance.uuid));
			}

			return right(undefined);
		} catch (err) {
			return left(new UnknownError((err as Error).message));
		}
	}

	async delete(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			const result = await this.#collection.deleteOne({
				_id: toObjectId(uuid),
			});

			if (result.deletedCount === 0) {
				return left(new WorkflowInstanceNotFoundError(uuid));
			}

			return right(undefined);
		} catch (err) {
			return left(new UnknownError((err as Error).message));
		}
	}

	async findByWorkflowDefinition(
		workflowDefinitionUuid: string,
	): Promise<Either<AntboxError, WorkflowInstance[]>> {
		try {
			const docs = await this.#collection.find({
				workflowDefinitionUuid,
			}).toArray();

			return right(docs.map((doc) => this.#fromDbModel(doc)));
		} catch (err) {
			return left(new UnknownError((err as Error).message));
		}
	}

	async findByState(
		workflowDefinitionUuid: string,
		stateName: string,
	): Promise<Either<AntboxError, WorkflowInstance[]>> {
		try {
			const docs = await this.#collection.find({
				workflowDefinitionUuid,
				currentStateName: stateName,
			}).toArray();

			return right(docs.map((doc) => this.#fromDbModel(doc)));
		} catch (err) {
			return left(new UnknownError((err as Error).message));
		}
	}

	async findActive(
		workflowDefinitionUuid?: string,
	): Promise<Either<AntboxError, WorkflowInstance[]>> {
		try {
			const filter: Document = workflowDefinitionUuid
				? { workflowDefinitionUuid }
				: {};

			const docs = await this.#collection.find(filter).toArray();

			// Note: This returns all instances. Filtering for "active" (non-final states)
			// requires loading the workflow definition to check which states are final.
			// This could be optimized by maintaining a separate "isFinal" flag on the instance.

			return right(docs.map((doc) => this.#fromDbModel(doc)));
		} catch (err) {
			return left(new UnknownError((err as Error).message));
		}
	}

	#toDbModel(instance: WorkflowInstance): WorkflowInstanceDbModel {
		const { uuid, ...rest } = instance;
		return {
			_id: toObjectId(uuid),
			...rest,
		};
	}

	#fromDbModel(doc: Document): WorkflowInstance {
		const { _id, ...rest } = doc;
		return {
			uuid: _id.toString(),
			...(rest as Omit<WorkflowInstance, "uuid">),
		};
	}
}

function toObjectId(uuid: string): ObjectId {
	try {
		return new ObjectId(uuid);
	} catch {
		// If not a valid ObjectId, create one from the hash of the UUID
		return ObjectId.createFromHexString(
			uuid.replace(/-/g, "").substring(0, 24).padEnd(24, "0"),
		);
	}
}
