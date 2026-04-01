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
		/^([\w\d]{4,}|--[\w\d]{4,}--)$/,
		"UUID must be at least 4 alphanumeric characters or wrapped in -- with at least 4 characters",
	),
	title: z.string().min(3, "Workflow title must be at least 3 characters"),
	description: z.string().optional(),
	states: z.array(WorkflowStateSchema).min(1, "Workflow must have at least one state"),
	availableStateNames: z.array(z.string()).min(1, "Available state names required"),
	filters: z.array(z.tuple([z.string(), z.string(), z.any()])),
	participants: z.array(z.string()),
	createdTime: z.string(),
	modifiedTime: z.string(),
}).superRefine((data, ctx) => {
	const stateNames = data.states.map((s) => s.name);

	// Exactly one initial state
	const initialStates = data.states.filter((s) => s.isInitial);
	if (initialStates.length === 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Workflow must have exactly one initial state",
			path: ["states"],
		});
	} else if (initialStates.length > 1) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `Workflow must have exactly one initial state, found ${initialStates.length}: ${
				initialStates.map((s) => s.name).join(", ")
			}`,
			path: ["states"],
		});
	}

	// Unique state names
	const seenStateNames = new Set<string>();
	for (const name of stateNames) {
		if (seenStateNames.has(name)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Duplicate state name: "${name}"`,
				path: ["states"],
			});
			break;
		}
		seenStateNames.add(name);
	}

	// Unique signals per state and transition targets exist
	for (let i = 0; i < data.states.length; i++) {
		const state = data.states[i];
		const seenSignals = new Set<string>();

		for (const transition of state.transitions ?? []) {
			// Unique signal within state
			if (seenSignals.has(transition.signal)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Duplicate signal "${transition.signal}" in state "${state.name}"`,
					path: ["states", i, "transitions"],
				});
			}
			seenSignals.add(transition.signal);

			// Transition target exists
			if (!stateNames.includes(transition.targetState)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						`Transition target "${transition.targetState}" in state "${state.name}" does not exist`,
					path: ["states", i, "transitions"],
				});
			}
		}
	}

	// availableStateNames matches actual state names
	const availableSet = new Set(data.availableStateNames);
	const stateSet = new Set(stateNames);

	const missing = [...stateSet].filter((n) => !availableSet.has(n));
	const extra = [...availableSet].filter((n) => !stateSet.has(n));

	if (missing.length > 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `availableStateNames is missing state(s): ${missing.join(", ")}`,
			path: ["availableStateNames"],
		});
	}
	if (extra.length > 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `availableStateNames contains unknown state(s): ${extra.join(", ")}`,
			path: ["availableStateNames"],
		});
	}

	// transition.groupsAllowed and state.groupsAllowedToModify must be subsets of participants
	const participantsSet = new Set(data.participants);

	for (let i = 0; i < data.states.length; i++) {
		const state = data.states[i];

		const outsideModify = (state.groupsAllowedToModify ?? []).filter(
			(g) => !participantsSet.has(g),
		);
		if (outsideModify.length > 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					`State "${state.name}" groupsAllowedToModify contains group(s) not in participants: ${
						outsideModify.join(", ")
					}`,
				path: ["states", i, "groupsAllowedToModify"],
			});
		}

		for (let j = 0; j < (state.transitions ?? []).length; j++) {
			const transition = state.transitions![j];
			const outsideTransition = (transition.groupsAllowed ?? []).filter(
				(g) => !participantsSet.has(g),
			);
			if (outsideTransition.length > 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						`Transition "${transition.signal}" in state "${state.name}" groupsAllowed contains group(s) not in participants: ${
							outsideTransition.join(", ")
						}`,
					path: ["states", i, "transitions", j, "groupsAllowed"],
				});
			}
		}
	}
});

export type WorkflowDataSchemaType = z.infer<typeof WorkflowDataSchema>;
