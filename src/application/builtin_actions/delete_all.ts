import { Either } from "/shared/either.ts";
import { Action, RunContext, SecureNodeService } from "/domain/actions/action.ts";
import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { AuthContextProvider } from "../auth_provider.ts";

export default {
	uuid: "delete_all",
	title: "Eliminar",
	description: "Elimina todos os nós selecionados",
	builtIn: true,
	multiple: false,
	filters: [],
	params: [],
	runManually: true,
	runOnCreates: false,
	runOnUpdates: false,

	async run(
		ctx: RunContext,
		uuids: string[],
		_params?: Record<string, unknown>,
	): Promise<void | Error> {
		const toDeleteTask = deleteTaskPredicate(ctx.authContext, ctx.nodeService);
		const tasks = uuids.map(toDeleteTask);

		const results = await Promise.all(tasks);

		const errors = results.filter(errorResultsOnly);

		if (errors.length > 0) {
			return errors[0].value;
		}

		return;
	},
} as Action;

function errorResultsOnly(voidOrErr: Either<NodeNotFoundError, void>): boolean {
	return voidOrErr.isLeft();
}

function deleteTaskPredicate(
	authContext: AuthContextProvider,
	nodeService: SecureNodeService,
) {
	return (uuid: string) => {
		return nodeService.delete(authContext, uuid);
	};
}
