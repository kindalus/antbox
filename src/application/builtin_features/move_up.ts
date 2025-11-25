import type { AuthenticationContext } from "application/authentication_context.ts";
import type { NodeService } from "application/node_service.ts";
import type { RunContext } from "domain/features/feature_run_context.ts";
import { Folders } from "domain/nodes/folders.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { Feature } from "domain/features/feature.ts";

const moveUp: Feature = {
	uuid: "move_up",
	name: "Move Up",
	description: "Move nodes one level up in the folder hierarchy",
	exposeAction: true,
	runOnCreates: false,
	runOnUpdates: false,
	runManually: true,
	filters: [
		[
			"parent",
			"not-in",
			[
				Folders.ASPECTS_FOLDER_UUID,
				Folders.FEATURES_FOLDER_UUID,
				Folders.GROUPS_FOLDER_UUID,
				Folders.ROOT_FOLDER_UUID,
				Folders.SYSTEM_FOLDER_UUID,
				Folders.USERS_FOLDER_UUID,
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
		const newParentOrErr = await getNewParent(
			ctx.authenticationContext,
			ctx.nodeService,
			uuids[0],
		);

		if (newParentOrErr.isLeft()) {
			throw newParentOrErr.value;
		}

		const toUpdateTask = updateTaskPredicate(
			ctx.authenticationContext,
			ctx.nodeService,
			newParentOrErr.value,
		);

		const taskPromises = uuids.map(toUpdateTask);

		const results = await Promise.all(taskPromises);

		const errors = results.filter(errorResultsOnly);

		if (errors.length > 0) {
			throw errors[0].value as AntboxError;
		}
	},
};

function updateTaskPredicate(
	ctx: AuthenticationContext,
	nodeService: NodeService,
	parent: string,
) {
	return (uuid: string) => nodeService.update(ctx, uuid, { parent });
}

function errorResultsOnly(voidOrErr: Either<AntboxError, unknown>): boolean {
	return voidOrErr.isLeft();
}

async function getNewParent(
	ctx: AuthenticationContext,
	nodeService: NodeService,
	uuid: string,
): Promise<Either<NodeNotFoundError, string>> {
	const nodeOrErr = await nodeService.get(ctx, uuid);

	if (nodeOrErr.isLeft()) {
		return left(nodeOrErr.value);
	}

	if (Folders.ROOT_FOLDER_UUID === nodeOrErr.value.parent) {
		return left(new NodeNotFoundError("Already at root folder"));
	}

	const firstParentOrErr = await nodeService.get(ctx, nodeOrErr.value.parent);

	if (firstParentOrErr.isLeft()) {
		return left(firstParentOrErr.value);
	}

	return right(firstParentOrErr.value.parent);
}

export default moveUp;
