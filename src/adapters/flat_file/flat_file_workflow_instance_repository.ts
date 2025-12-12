import { type Either, left, right } from "shared/either.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import type { WorkflowInstance } from "domain/workflows/workflow_instance.ts";
import type { WorkflowInstanceRepository } from "domain/workflows/workflow_instance_repository.ts";
import { InmemWorkflowInstanceRepository } from "adapters/inmem/inmem_workflow_instance_repository.ts";
import { join } from "path";
import { copyFile, fileExistsSync } from "shared/os_helpers.ts";

export default function buildFlatFileWorkflowInstanceRepository(
	baseDir: string,
): Promise<Either<AntboxError, WorkflowInstanceRepository>> {
	const dbFilePath = join(baseDir, "workflow_instances_repo.json");
	const dbBackupFilePath = join(baseDir, "workflow_instances_repo.json.backup");

	try {
		if (!fileExistsSync(baseDir)) {
			Deno.mkdirSync(baseDir, { recursive: true });
		}

		let instances: WorkflowInstance[] = [];
		if (fileExistsSync(dbFilePath)) {
			const data = Deno.readTextFileSync(dbFilePath);
			instances = JSON.parse(data);

			copyFile(dbFilePath, dbBackupFilePath);
		}

		return Promise.resolve(
			right(new FlatFileWorkflowInstanceRepository(dbFilePath, instances)),
		);
	} catch (err) {
		return Promise.resolve(left(new UnknownError(err as string)));
	}
}

class FlatFileWorkflowInstanceRepository implements WorkflowInstanceRepository {
	readonly #dbFilePath: string;
	readonly #encoder: TextEncoder;
	readonly #instances: Map<string, WorkflowInstance>;

	constructor(dbPath: string, instances: WorkflowInstance[] = []) {
		this.#dbFilePath = dbPath;
		this.#encoder = new TextEncoder();
		this.#instances = new Map();

		// Load all instances into memory
		for (const instance of instances) {
			this.#instances.set(instance.uuid, instance);
		}
	}

	#dataAsArray(): WorkflowInstance[] {
		return Array.from(this.#instances.values());
	}

	#saveDb() {
		const instances = this.#dataAsArray();
		const rawData = this.#encoder.encode(JSON.stringify(instances));
		Deno.writeFileSync(this.#dbFilePath, rawData);
	}

	async add(instance: WorkflowInstance): Promise<Either<AntboxError, void>> {
		if (this.#instances.has(instance.uuid)) {
			return left(
				new AntboxError(
					"DuplicateWorkflowInstance",
					`Workflow instance ${instance.uuid} already exists`,
				),
			);
		}

		// Deep clone to avoid mutations
		this.#instances.set(instance.uuid, structuredClone(instance));
		this.#saveDb();

		return right(undefined);
	}

	async getByUuid(
		uuid: string,
	): Promise<Either<AntboxError, WorkflowInstance>> {
		const instance = this.#instances.get(uuid);

		if (!instance) {
			return left(
				new AntboxError(
					"WorkflowInstanceNotFound",
					`Workflow instance ${uuid} not found`,
				),
			);
		}

		// Deep clone to avoid mutations
		return right(structuredClone(instance));
	}

	async getByNodeUuid(
		nodeUuid: string,
	): Promise<Either<AntboxError, WorkflowInstance>> {
		const instance = Array.from(this.#instances.values()).find(
			(i) => i.nodeUuid === nodeUuid,
		);

		if (!instance) {
			return left(
				new AntboxError(
					"WorkflowInstanceNotFound",
					`Workflow instance for node ${nodeUuid} not found`,
				),
			);
		}

		// Deep clone to avoid mutations
		return right(structuredClone(instance));
	}

	async update(instance: WorkflowInstance): Promise<Either<AntboxError, void>> {
		if (!this.#instances.has(instance.uuid)) {
			return left(
				new AntboxError(
					"WorkflowInstanceNotFound",
					`Workflow instance ${instance.uuid} not found`,
				),
			);
		}

		// Deep clone to avoid mutations
		this.#instances.set(instance.uuid, structuredClone(instance));
		this.#saveDb();

		return right(undefined);
	}

	async delete(uuid: string): Promise<Either<AntboxError, void>> {
		if (!this.#instances.has(uuid)) {
			return left(
				new AntboxError(
					"WorkflowInstanceNotFound",
					`Workflow instance ${uuid} not found`,
				),
			);
		}

		this.#instances.delete(uuid);
		this.#saveDb();

		return right(undefined);
	}

	async findByWorkflowDefinition(
		workflowDefinitionUuid: string,
	): Promise<Either<AntboxError, WorkflowInstance[]>> {
		const instances = Array.from(this.#instances.values()).filter(
			(i) => i.workflowDefinitionUuid === workflowDefinitionUuid,
		);

		// Deep clone to avoid mutations
		return right(structuredClone(instances));
	}

	async findByState(
		workflowDefinitionUuid: string,
		stateName: string,
	): Promise<Either<AntboxError, WorkflowInstance[]>> {
		const instances = Array.from(this.#instances.values()).filter(
			(i) =>
				i.workflowDefinitionUuid === workflowDefinitionUuid &&
				i.currentStateName === stateName,
		);

		// Deep clone to avoid mutations
		return right(structuredClone(instances));
	}

	async findActive(
		workflowDefinitionUuid?: string,
	): Promise<Either<AntboxError, WorkflowInstance[]>> {
		let instances = Array.from(this.#instances.values());

		if (workflowDefinitionUuid) {
			instances = instances.filter(
				(i) => i.workflowDefinitionUuid === workflowDefinitionUuid,
			);
		}

		// Note: This returns all instances. Filtering for "active" (non-final states)
		// requires loading the workflow definition to check which states are final.
		// This could be optimized by maintaining a separate "isFinal" flag on the instance.

		// Deep clone to avoid mutations
		return right(structuredClone(instances));
	}
}
