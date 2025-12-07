import { assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { WorkflowNode } from "./workflow_node.ts";
import { Nodes } from "../nodes/nodes.ts";
import { Folders } from "../nodes/folders.ts";
import { ValidationError } from "shared/validation_error.ts";

Deno.test("WorkflowNode.create should create a valid workflow node", () => {
	const metadata = {
		owner: "user@example.com",
		title: "My Workflow",
		availableStateNames: ["Draft", "Published"],
		states: [
			{
				name: "Draft",
				isInitial: true,
				transitions: [
					{
						signal: "publish",
						targetState: "Published",
					},
				],
			},
			{
				name: "Published",
				isFinal: true,
			},
		],
	};

	const result = WorkflowNode.create(metadata);

	assertEquals(result.isRight(), true);
	if (result.isRight()) {
		const node = result.value;
		assertEquals(node.title, "My Workflow");
		assertEquals(node.mimetype, Nodes.WORKFLOW_MIMETYPE);
		assertEquals(node.parent, Folders.WORKFLOWS_FOLDER_UUID);
		assertEquals(node.availableStateNames.length, 2);
		assertEquals(node.states.length, 2);
	}
});

Deno.test("WorkflowNode.create should fail if title is missing", () => {
	const metadata = {
		owner: "user@example.com",
		availableStateNames: ["Draft"],
		states: [{ name: "Draft", isInitial: true, isFinal: true }],
	};

	const result = WorkflowNode.create(metadata);
	assertEquals(result.isLeft(), true);
	if (result.isLeft()) {
		assertEquals(result.value.message, "Title is required");
	}
});

Deno.test("WorkflowNode.create should fail if validation logic fails", () => {
	// Invalid: Draft cannot be both Initial and Final
	const metadata = {
		owner: "user@example.com",
		title: "Bad Workflow",
		availableStateNames: ["Draft"],
		states: [{ name: "Draft", isInitial: true, isFinal: true }],
	};

	const result = WorkflowNode.create(metadata);
	assertEquals(result.isLeft(), true);
	if (result.isLeft()) {
		// Expect validation error from validateWorkflowDefinition
		assertEquals(
			result.value.message.includes("cannot be both Initial and Final"),
			true,
		);
	}
});

Deno.test("WorkflowNode.create should fail if transition target is invalid", () => {
	const metadata = {
		owner: "user@example.com",
		title: "Bad Transition",
		availableStateNames: ["Draft"],
		states: [
			{
				name: "Draft",
				isInitial: true,
				transitions: [
					{
						signal: "go",
						targetState: "NonExistent",
					},
				],
			},
		],
	};

	const result = WorkflowNode.create(metadata);
	assertEquals(result.isLeft(), true);
});
