import { z } from "zod";

// Schema for WorkflowTransitionHistory
const WorkflowTransitionHistorySchema = z.object({
	from: z.string().min(1, "From state is required"),
	to: z.string().min(1, "To state is required"),
	signal: z.string().min(1, "Signal is required"),
	timestamp: z.string(),
	user: z.string().email("Valid user email is required"),
	message: z.string().optional(),
});

// Schema for WorkflowDefinitionSnapshot
const WorkflowDefinitionSnapshotSchema = z.object({
	uuid: z.string(),
	title: z.string(),
	description: z.string(),
	createdTime: z.string(),
	modifiedTime: z.string(),
	states: z.array(z.any()), // Complex nested structure
	availableStateNames: z.array(z.string()),
	groupsAllowed: z.array(z.string()),
});

// Schema for WorkflowInstanceData
export const WorkflowInstanceDataSchema = z.object({
	uuid: z.string().regex(
		/^([\w\d]{8,}|--[\w\d]{4,}--)$/,
		"UUID must be at least 8 alphanumeric characters or wrapped in -- with at least 4 characters",
	),
	workflowDefinitionUuid: z.string().min(1, "Workflow definition UUID is required"),
	workflowDefinition: WorkflowDefinitionSnapshotSchema,
	nodeUuid: z.string().min(1, "Node UUID is required"),
	currentStateName: z.string().min(1, "Current state name is required"),
	history: z.array(WorkflowTransitionHistorySchema),
	running: z.boolean(),
	cancelled: z.boolean(),
	groupsAllowed: z.array(z.string()),
	owner: z.string().email("Valid owner email is required"),
	startedTime: z.string(),
	modifiedTime: z.string(),
});

export type WorkflowInstanceDataSchemaType = z.infer<typeof WorkflowInstanceDataSchema>;
