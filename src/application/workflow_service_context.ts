import type { WorkflowInstanceRepository } from "domain/workflows/workflow_instance_repository.ts";
import type { NodeService } from "./node_service.ts";

export interface WorkflowServiceContext {
	workflowInstanceRepository: WorkflowInstanceRepository;
	nodeService: NodeService;
}
