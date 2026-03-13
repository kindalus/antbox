import { Nodes } from "../nodes/nodes.ts";
import type { FeatureData } from "./feature_data.ts";

const BASE_TIME = "2024-01-01T00:00:00.000Z";

const MOVE_UP_RUN = `async function(ctx, args) {
	const uuids = args["uuids"];
	if (!Array.isArray(uuids) || uuids.length === 0) {
		throw new Error("Node UUIDs parameter 'uuids' is required");
	}

	const firstNodeOrErr = await ctx.nodeService.get(uuids[0]);
	if (firstNodeOrErr.isLeft()) {
		throw firstNodeOrErr.value;
	}

	if (firstNodeOrErr.value.parent === "--root--") {
		throw new Error("Already at root folder");
	}

	const parentNodeOrErr = await ctx.nodeService.get(firstNodeOrErr.value.parent);
	if (parentNodeOrErr.isLeft()) {
		throw parentNodeOrErr.value;
	}

	const newParent = parentNodeOrErr.value.parent;
	for (const uuid of uuids) {
		const updatedOrErr = await ctx.nodeService.update(uuid, { parent: newParent });
		if (updatedOrErr.isLeft()) {
			throw updatedOrErr.value;
		}
	}
}`;

const CALL_AGENT_RUN = `async function() {
	return undefined;
}`;

export const MOVE_UP_FEATURE_UUID = "move_up";
export const CALL_AGENT_FEATURE_UUID = "call_agent";

export const MOVE_UP_FEATURE: FeatureData = {
	uuid: MOVE_UP_FEATURE_UUID,
	title: "Move Up",
	description: "Move nodes one level up in the folder hierarchy",
	exposeAction: true,
	runOnCreates: false,
	runOnUpdates: false,
	runOnDeletes: false,
	runManually: true,
	filters: [
		[
			"parent",
			"not-in",
			[
				Nodes.ROOT_FOLDER_UUID,
			],
		],
	],
	exposeExtension: false,
	exposeAITool: true,
	runAs: undefined,
	groupsAllowed: [],
	parameters: [
		{
			name: "uuids",
			type: "array",
			arrayType: "string",
			required: true,
			description: "Array of node UUIDs to move up",
			defaultValue: undefined,
		},
	],
	returnType: "void",
	returnDescription: "Moves the specified nodes up one level in the folder hierarchy",
	returnContentType: undefined,
	tags: [],
	run: MOVE_UP_RUN,
	createdTime: BASE_TIME,
	modifiedTime: BASE_TIME,
};

export const CALL_AGENT_FEATURE: FeatureData = {
	uuid: CALL_AGENT_FEATURE_UUID,
	title: "Call Agent",
	description: "Call an AI agent with a prompt enriched by relevant node metadata and content",
	exposeAction: true,
	runOnCreates: false,
	runOnUpdates: false,
	runOnDeletes: false,
	runManually: true,
	filters: [],
	exposeExtension: false,
	exposeAITool: false,
	runAs: undefined,
	groupsAllowed: [],
	parameters: [
		{
			name: "uuids",
			type: "array",
			arrayType: "string",
			required: true,
			description: "Array of node UUIDs to include in the agent context",
			defaultValue: undefined,
		},
		{
			name: "agentUuid",
			type: "string",
			required: true,
			description: "Agent UUID to execute",
			defaultValue: undefined,
		},
		{
			name: "prompt",
			type: "string",
			required: true,
			description: "Prompt to send to the target agent",
			defaultValue: undefined,
		},
		{
			name: "runSync",
			type: "boolean",
			required: false,
			description: "Wait for the agent answer before returning",
			defaultValue: false,
		},
	],
	returnType: "object",
	returnDescription: "Returns started status for background execution or the final agent message",
	returnContentType: "application/json",
	tags: ["ai", "agent"],
	run: CALL_AGENT_RUN,
	createdTime: BASE_TIME,
	modifiedTime: BASE_TIME,
};

/**
 * Built-in features available in all tenants
 * These are readonly and cannot be modified or deleted
 */
export const BUILTIN_FEATURES: readonly FeatureData[] = [
	MOVE_UP_FEATURE,
	CALL_AGENT_FEATURE,
];
