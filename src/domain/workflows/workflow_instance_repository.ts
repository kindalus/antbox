import type { Either } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { WorkflowInstance } from "./workflow_instance.ts";

/**
 * Repository for managing workflow instances.
 * Stores the runtime state of workflows attached to nodes.
 */
export interface WorkflowInstanceRepository {
	/**
	 * Add a new workflow instance.
	 * @param instance - The workflow instance to add
	 * @returns Either an error or void on success
	 */
	add(instance: WorkflowInstance): Promise<Either<AntboxError, void>>;

	/**
	 * Get a workflow instance by its UUID.
	 * @param uuid - The workflow instance UUID
	 * @returns Either an error or the workflow instance
	 */
	getByUuid(uuid: string): Promise<Either<AntboxError, WorkflowInstance>>;

	/**
	 * Get the workflow instance for a specific node.
	 * @param nodeUuid - The node UUID
	 * @returns Either an error or the workflow instance
	 */
	getByNodeUuid(nodeUuid: string): Promise<Either<AntboxError, WorkflowInstance>>;

	/**
	 * Update an existing workflow instance.
	 * @param instance - The updated workflow instance
	 * @returns Either an error or void on success
	 */
	update(instance: WorkflowInstance): Promise<Either<AntboxError, void>>;

	/**
	 * Delete a workflow instance.
	 * @param uuid - The workflow instance UUID
	 * @returns Either an error or void on success
	 */
	delete(uuid: string): Promise<Either<AntboxError, void>>;

	/**
	 * Find all instances of a specific workflow definition.
	 * @param workflowDefinitionUuid - The workflow definition UUID
	 * @returns Either an error or array of workflow instances
	 */
	findByWorkflowDefinition(
		workflowDefinitionUuid: string,
	): Promise<Either<AntboxError, WorkflowInstance[]>>;

	/**
	 * Find all instances in a specific state.
	 * @param workflowDefinitionUuid - The workflow definition UUID
	 * @param stateName - The state name to filter by
	 * @returns Either an error or array of workflow instances
	 */
	findByState(
		workflowDefinitionUuid: string,
		stateName: string,
	): Promise<Either<AntboxError, WorkflowInstance[]>>;

	/**
	 * Find all active workflow instances (not in final states).
	 * @param workflowDefinitionUuid - Optional workflow definition UUID to filter by
	 * @returns Either an error or array of workflow instances
	 */
	findActive(
		workflowDefinitionUuid?: string,
	): Promise<Either<AntboxError, WorkflowInstance[]>>;
}
