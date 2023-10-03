import { Action } from "../../domain/actions/action.ts";
import { RunContext } from "../../domain/actions/run_context.ts";
import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either } from "../../shared/either.ts";
import { NodeService } from "../node_service.ts";

export default {
	uuid: "move_to_folder",
	title: "Mover para pasta",
	description: "Move os nós para uma pasta",
	builtIn: true,
	multiple: true,
	filters: [],
	params: ["to"],
	runManually: true,
	runOnCreates: false,
	runOnUpdates: false,

	async run(
		ctx: RunContext,
		uuids: string[],
		params: Record<string, string>,
	): Promise<void | Error> {
		const parent = params["to"];

		if (!parent) {
			return new Error("Error parameter not given");
		}

		const toUpdateTask = updateTaskPredicate(ctx.nodeService, parent);

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
	return (uuid: string) => nodeService.update(uuid, { parent });
}

function errorResultsOnly(
	voidOrErr: Either<NodeNotFoundError, unknown>,
): boolean {
	return voidOrErr.isLeft();
}
