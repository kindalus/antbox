import { Action } from "../../domain/actions/action.ts";
import { RunContext } from "../../domain/actions/run_context.ts";

export default {
	uuid: "move_to_trash",
	title: "Mover para o lixo",
	description: "Move o nó para o lixo",
	builtIn: true,
	multiple: false,
	runManually: true,
	runOnCreates: false,
	runOnUpdates: false,
	params: [],
	filters: [],

	async run(
		ctx: RunContext,
		uuids: string[],
		_params?: Record<string, unknown>,
	): Promise<void | Error> {
		await ctx.nodeService.update(
			uuids[0],
			{
				properties: {
					"web-content:published": true,
				},
			},
			true,
		);
	},
} as Action;
