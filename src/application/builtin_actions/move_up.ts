import { Action } from "../../domain/actions/action.ts";
import { RunContext } from "../../domain/actions/run_context.ts";

import { Node } from "../../domain/nodes/node.ts";
import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either, left, right } from "../../shared/either.ts";
import { NodeService } from "../node_service.ts";

export default {
	uuid: "move_up",
	title: "Mover para cima",
	description: "Move o nó para uma pasta acima",
	builtIn: true,
	multiple: false,
	runManually: true,
	runOnCreates: false,
	runOnUpdates: false,
	filters: [["parent", "not-in", [
		Folders.ACTIONS_FOLDER_UUID,
		Folders.ASPECTS_FOLDER_UUID,
		Folders.EXT_FOLDER_UUID,
		Folders.GROUPS_FOLDER_UUID,
		Folders.FORMS_SPECIFICATIONS_FOLDER_UUID,
		Folders.ROOT_FOLDER_UUID,
		Folders.SYSTEM_FOLDER_UUID,
		Folders.USERS_FOLDER_UUID,
	]]],
	groupsAllowed: [],
	params: [],

	async run(
		ctx: RunContext,
		uuids: string[],
		_params?: Record<string, unknown>,
	): Promise<void | Error> {
		const newParentOrErr = await getNewParent(ctx.nodeService, uuids[0]);

		if (newParentOrErr.isLeft()) {
			return newParentOrErr.value;
		}

		const toUpdateTask = updateTaskPredicate(
			ctx.nodeService,
			newParentOrErr.value,
		);

		const taskPromises = uuids.map(toUpdateTask);

		const results = await Promise.all(taskPromises);

		const errors = results.filter(errorResultsOnly);

		if (errors.length > 0) {
			return errors[0].value as AntboxError;
		}

		return;
	},
} as Action;

function updateTaskPredicate(nodeService: NodeService, parent: string) {
	return (uuid: string) => nodeService.update(uuid, { parent }, true);
}

function errorResultsOnly(voidOrErr: Either<AntboxError, unknown>): boolean {
	return voidOrErr.isLeft();
}

async function getNewParent(
	nodeService: NodeService,
	uuid: string,
): Promise<Either<NodeNotFoundError, string>> {
	const nodeOrErr = await nodeService.get(uuid);

	if (nodeOrErr.isLeft()) {
		return left(nodeOrErr.value);
	}

	if (Node.isRootFolder(nodeOrErr.value.parent)) {
		return left(new NodeNotFoundError("Already at root folder"));
	}

	const firstParentOrErr = await nodeService.get(nodeOrErr.value.parent);

	if (firstParentOrErr.isLeft()) {
		return left(firstParentOrErr.value);
	}

	return right(firstParentOrErr.value.parent);
}
