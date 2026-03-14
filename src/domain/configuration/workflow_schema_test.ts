import { describe, it } from "bdd";
import { expect } from "expect";
import { WorkflowDataSchema } from "./workflow_schema.ts";

const now = new Date().toISOString();

function baseWorkflow(overrides: Record<string, unknown> = {}) {
	return {
		uuid: "wftest001",
		title: "Test Workflow",
		states: [
			{
				name: "draft",
				isInitial: true,
				transitions: [{ signal: "submit", targetState: "review" }],
			},
			{
				name: "review",
				isFinal: true,
			},
		],
		availableStateNames: ["draft", "review"],
		filters: [],
		participants: [],
		createdTime: now,
		modifiedTime: now,
		...overrides,
	};
}

describe("WorkflowDataSchema", () => {
	describe("valid workflow", () => {
		it("should accept a well-formed workflow definition", () => {
			const result = WorkflowDataSchema.safeParse(baseWorkflow());
			expect(result.success).toBe(true);
		});
	});

	describe("exactly one initial state", () => {
		it("should reject when no initial state is defined", () => {
			const data = baseWorkflow({
				states: [
					{ name: "draft", transitions: [{ signal: "submit", targetState: "review" }] },
					{ name: "review", isFinal: true },
				],
			});
			const result = WorkflowDataSchema.safeParse(data);
			expect(result.success).toBe(false);
			if (!result.success) {
				const messages = result.error.issues.map((i) => i.message);
				expect(messages.some((m) => m.includes("exactly one initial state"))).toBe(true);
			}
		});

		it("should reject when more than one initial state is defined", () => {
			const data = baseWorkflow({
				states: [
					{
						name: "draft",
						isInitial: true,
						transitions: [{ signal: "submit", targetState: "review" }],
					},
					{ name: "review", isInitial: true, isFinal: true },
				],
			});
			const result = WorkflowDataSchema.safeParse(data);
			expect(result.success).toBe(false);
			if (!result.success) {
				const messages = result.error.issues.map((i) => i.message);
				expect(messages.some((m) => m.includes("exactly one initial state"))).toBe(true);
			}
		});
	});

	describe("unique state names", () => {
		it("should accept distinct state names", () => {
			const result = WorkflowDataSchema.safeParse(baseWorkflow());
			expect(result.success).toBe(true);
		});

		it("should reject duplicate state names", () => {
			const data = baseWorkflow({
				states: [
					{
						name: "draft",
						isInitial: true,
						transitions: [{ signal: "submit", targetState: "draft" }],
					},
					{ name: "draft", isFinal: true },
				],
				availableStateNames: ["draft"],
			});
			const result = WorkflowDataSchema.safeParse(data);
			expect(result.success).toBe(false);
			if (!result.success) {
				const messages = result.error.issues.map((i) => i.message);
				expect(messages.some((m) => m.includes("Duplicate state name"))).toBe(true);
			}
		});
	});

	describe("unique signals per state", () => {
		it("should accept distinct signals within a state", () => {
			const data = baseWorkflow({
				states: [
					{
						name: "draft",
						isInitial: true,
						transitions: [
							{ signal: "submit", targetState: "review" },
							{ signal: "discard", targetState: "review" },
						],
					},
					{ name: "review", isFinal: true },
				],
			});
			const result = WorkflowDataSchema.safeParse(data);
			expect(result.success).toBe(true);
		});

		it("should reject duplicate signals within the same state", () => {
			const data = baseWorkflow({
				states: [
					{
						name: "draft",
						isInitial: true,
						transitions: [
							{ signal: "submit", targetState: "review" },
							{ signal: "submit", targetState: "review" },
						],
					},
					{ name: "review", isFinal: true },
				],
			});
			const result = WorkflowDataSchema.safeParse(data);
			expect(result.success).toBe(false);
			if (!result.success) {
				const messages = result.error.issues.map((i) => i.message);
				expect(messages.some((m) => m.includes("Duplicate signal"))).toBe(true);
			}
		});
	});

	describe("transition targets exist", () => {
		it("should accept transitions that reference existing states", () => {
			const result = WorkflowDataSchema.safeParse(baseWorkflow());
			expect(result.success).toBe(true);
		});

		it("should reject transitions that reference a non-existent target state", () => {
			const data = baseWorkflow({
				states: [
					{
						name: "draft",
						isInitial: true,
						transitions: [{ signal: "submit", targetState: "nonexistent" }],
					},
					{ name: "review", isFinal: true },
				],
			});
			const result = WorkflowDataSchema.safeParse(data);
			expect(result.success).toBe(false);
			if (!result.success) {
				const messages = result.error.issues.map((i) => i.message);
				expect(messages.some((m) => m.includes("does not exist"))).toBe(true);
			}
		});
	});

	describe("availableStateNames matches state names", () => {
		it("should accept when availableStateNames exactly matches state names", () => {
			const result = WorkflowDataSchema.safeParse(baseWorkflow());
			expect(result.success).toBe(true);
		});

		it("should reject when availableStateNames is missing a state", () => {
			const data = baseWorkflow({ availableStateNames: ["draft"] });
			const result = WorkflowDataSchema.safeParse(data);
			expect(result.success).toBe(false);
			if (!result.success) {
				const messages = result.error.issues.map((i) => i.message);
				expect(messages.some((m) => m.includes("missing state"))).toBe(true);
			}
		});

		it("should reject when availableStateNames contains an unknown state", () => {
			const data = baseWorkflow({ availableStateNames: ["draft", "review", "ghost"] });
			const result = WorkflowDataSchema.safeParse(data);
			expect(result.success).toBe(false);
			if (!result.success) {
				const messages = result.error.issues.map((i) => i.message);
				expect(messages.some((m) => m.includes("unknown state"))).toBe(true);
			}
		});
	});

	describe("subset invariant: groups must be subsets of participants", () => {
		it("should reject when state.groupsAllowedToModify contains a group not in participants", () => {
			const data = baseWorkflow({
				participants: ["--editors--"],
				states: [
					{
						name: "draft",
						isInitial: true,
						groupsAllowedToModify: ["--outsiders--"],
						transitions: [{ signal: "submit", targetState: "review" }],
					},
					{ name: "review", isFinal: true },
				],
			});
			const result = WorkflowDataSchema.safeParse(data);
			expect(result.success).toBe(false);
			if (!result.success) {
				const messages = result.error.issues.map((i) => i.message);
				expect(messages.some((m) => m.includes("groupsAllowedToModify"))).toBe(true);
			}
		});

		it("should reject when transition.groupsAllowed contains a group not in participants", () => {
			const data = baseWorkflow({
				participants: ["--editors--"],
				states: [
					{
						name: "draft",
						isInitial: true,
						transitions: [
							{
								signal: "submit",
								targetState: "review",
								groupsAllowed: ["--outsiders--"],
							},
						],
					},
					{ name: "review", isFinal: true },
				],
			});
			const result = WorkflowDataSchema.safeParse(data);
			expect(result.success).toBe(false);
			if (!result.success) {
				const messages = result.error.issues.map((i) => i.message);
				expect(messages.some((m) => m.includes("groupsAllowed"))).toBe(true);
			}
		});
	});
});
