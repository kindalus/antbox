import { Action } from "../../domain/actions/action.ts";
import { RunContext } from "../../domain/actions/run_context.ts";
import { Node } from "../../domain/nodes/node.ts";
import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either } from "../../shared/either.ts";

export default {
	uuid: "delete_all",
	title: "Eliminar",
	description: "Elimina todos os nós selecionados",
	builtIn: true,
	multiple: false,
	filters: [["mimetype", "not-in", Node.SYSTEM_MIMETYPES]],
	params: [],
	runManually: true,
	runOnCreates: false,
	runOnUpdates: false,

	async run(
		ctx: RunContext,
		uuids: string[],
		_params?: Record<string, unknown>,
	): Promise<void | Error> {
		const tasks = uuids.map((uuid) => ctx.nodeService.delete(uuid));

		const results = await Promise.all(tasks);

		const errors = results.filter(errorResultsOnly);

		if (errors.length > 0) {
			errors.forEach((e) => console.error((e.value as AntboxError).message));
			return errors[0].value;
		}

		return;
	},
} as Action;

function errorResultsOnly(voidOrErr: Either<NodeNotFoundError, void>): boolean {
	return voidOrErr.isLeft();
}
