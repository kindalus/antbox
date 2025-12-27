import type { RunContext } from "domain/features/feature_run_context.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { Feature } from "domain/features/feature.ts";

const moveUp: Feature = {
	uuid: "move_up",
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

	async run(
		ctx: RunContext,
		args: Record<string, unknown>,
	): Promise<void> {
		const uuids = args["uuids"] as string[];

		if (!uuids || !Array.isArray(uuids) || uuids.length === 0) {
			throw new Error("Node UUIDs parameter 'uuids' is required");
		}
		const newParentOrErr = await getNewParent(ctx.nodeService, uuids[0]);

		if (newParentOrErr.isLeft()) {
			throw newParentOrErr.value;
		}

		const toUpdateTask = updateTaskPredicate(ctx.nodeService, newParentOrErr.value);

		const taskPromises = uuids.map(toUpdateTask);

		const results = await Promise.all(taskPromises);

		const errors = results.filter(errorResultsOnly);

		if (errors.length > 0) {
			throw errors[0].value as AntboxError;
		}
	},
};

function updateTaskPredicate(
	nodeService: RunContext["nodeService"],
	parent: string,
) {
	return (uuid: string) => nodeService.update(uuid, { parent });
}

function errorResultsOnly(voidOrErr: Either<AntboxError, unknown>): boolean {
	return voidOrErr.isLeft();
}

async function getNewParent(
	nodeService: RunContext["nodeService"],
	uuid: string,
): Promise<Either<NodeNotFoundError, string>> {
	const nodeOrErr = await nodeService.get(uuid);

	if (nodeOrErr.isLeft()) {
		return left(nodeOrErr.value);
	}

	if (Nodes.ROOT_FOLDER_UUID === nodeOrErr.value.parent) {
		return left(new NodeNotFoundError("Already at root folder"));
	}

	const firstParentOrErr = await nodeService.get(nodeOrErr.value.parent!);

	if (firstParentOrErr.isLeft()) {
		return left(firstParentOrErr.value);
	}

	return right(firstParentOrErr.value.parent!);
}

export default moveUp;
