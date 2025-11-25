import type { RunContext } from "domain/features/feature_run_context.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";
import { Feature } from "domain/features/feature.ts";

const deleteAll: Feature = {
	uuid: "delete_all",
	name: "Delete All",
	description: "Delete all selected nodes",
	exposeAction: true,
	runOnCreates: false,
	runOnUpdates: false,
	runManually: true,
	filters: [["mimetype", "not-in", Nodes.SYSTEM_MIMETYPES]],
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
			description: "Array of node UUIDs to delete",
			defaultValue: undefined,
		},
	],
	returnType: "void",
	returnDescription: "Deletes the specified nodes",

	async run(
		ctx: RunContext,
		args: Record<string, unknown>,
	): Promise<void> {
		const uuids = args["uuids"] as string[];

		if (!uuids || !Array.isArray(uuids) || uuids.length === 0) {
			throw new Error("Node UUIDs parameter 'uuids' is required");
		}

		const tasks = uuids.map((uuid) => ctx.nodeService.delete(ctx.authenticationContext, uuid));

		const results = await Promise.all(tasks);

		const errors = results.filter(errorResultsOnly);

		if (errors.length > 0) {
			errors.forEach((e) => console.error((e.value as AntboxError).message));
			throw errors[0].value;
		}
	},
};

function errorResultsOnly(voidOrErr: Either<NodeNotFoundError, void>): boolean {
	return voidOrErr.isLeft();
}

export default deleteAll;
