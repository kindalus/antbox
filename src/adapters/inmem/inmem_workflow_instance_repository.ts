import { type Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type { WorkflowInstance } from "domain/workflows/workflow_instance.ts";
import type { WorkflowInstanceRepository } from "domain/workflows/workflow_instance_repository.ts";

export class WorkflowInstanceNotFoundError extends AntboxError {
	constructor(uuid: string) {
		super("WorkflowInstanceNotFound", `Workflow instance ${uuid} not found`);
	}
}

export class InmemWorkflowInstanceRepository
	implements WorkflowInstanceRepository {
	#instances: Map<string, WorkflowInstance> = new Map();

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
		return right(undefined);
	}

	async getByUuid(
		uuid: string,
	): Promise<Either<AntboxError, WorkflowInstance>> {
		const instance = this.#instances.get(uuid);

		if (!instance) {
			return left(new WorkflowInstanceNotFoundError(uuid));
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
			return left(new WorkflowInstanceNotFoundError(`node:${nodeUuid}`));
		}

		// Deep clone to avoid mutations
		return right(structuredClone(instance));
	}

	async update(instance: WorkflowInstance): Promise<Either<AntboxError, void>> {
		if (!this.#instances.has(instance.uuid)) {
			return left(new WorkflowInstanceNotFoundError(instance.uuid));
		}

		// Deep clone to avoid mutations
		this.#instances.set(instance.uuid, structuredClone(instance));
		return right(undefined);
	}

	async delete(uuid: string): Promise<Either<AntboxError, void>> {
		if (!this.#instances.has(uuid)) {
			return left(new WorkflowInstanceNotFoundError(uuid));
		}

		this.#instances.delete(uuid);
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

		// Filter by running flag to get only active instances
		instances = instances.filter((i) => i.running);

		// Deep clone to avoid mutations
		return right(structuredClone(instances));
	}

	// Test helper methods

	/**
	 * Clear all instances (for testing)
	 */
	clear(): void {
		this.#instances.clear();
	}

	/**
	 * Get count of instances (for testing)
	 */
	count(): number {
		return this.#instances.size;
	}
}
