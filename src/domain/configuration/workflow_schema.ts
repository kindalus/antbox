import { z } from "zod";

// Schema for WorkflowTransition
const WorkflowTransitionSchema = z.object({
	signal: z.string().min(1, "Transition signal is required"),
	targetState: z.string().min(1, "Target state is required"),
	filters: z.array(z.tuple([z.string(), z.string(), z.any()])).optional(),
	actions: z.array(z.string()).optional(),
	groupsAllowed: z.array(z.string()).optional(),
});

// Schema for WorkflowState
const WorkflowStateSchema = z.object({
	name: z.string().min(1, "State name is required"),
	groupsAllowedToModify: z.array(z.string()).optional(),
	isInitial: z.boolean().optional(),
	isFinal: z.boolean().optional(),
	onEnter: z.array(z.string()).optional(),
	onExit: z.array(z.string()).optional(),
	transitions: z.array(WorkflowTransitionSchema).optional(),
});

// Schema for WorkflowData
export const WorkflowDataSchema = z.object({
	uuid: z.string().regex(
		/^([\w\d]{8,}|--[\w\d]{4,}--)$/,
		"UUID must be at least 8 alphanumeric characters or wrapped in -- with at least 4 characters",
	),
	title: z.string().min(3, "Workflow title must be at least 3 characters"),
	description: z.string().optional(),
	states: z.array(WorkflowStateSchema).min(1, "Workflow must have at least one state"),
	availableStateNames: z.array(z.string()).min(1, "Available state names required"),
	filters: z.array(z.tuple([z.string(), z.string(), z.any()])),
	groupsAllowed: z.array(z.string()),
	createdTime: z.string(),
	modifiedTime: z.string(),
});

export type WorkflowDataSchemaType = z.infer<typeof WorkflowDataSchema>;
