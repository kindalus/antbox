import { Node } from "../nodes/node.ts";
import { NodeFactory } from "../nodes/node_factory.ts";
import { NodeFilter } from "../nodes/node_filter.ts";
import { ActionNode } from "./action_node.ts";
import { RunContext } from "./run_context.ts";

/**
 * Regras das actions:
 * - para poder executar runOnCreate ou runOnUpdate
 * --- especificar aspect ou mimetype constraints
 * --- não pode especificar parametros
 *
 * - para ser executar como trigger das folders
 * --- tem que especificar o mimetype 'application/folder'
 * --- a folder tem que conter um dos aspectos especificados na mimetype constraints
 *
 * - para poder executar na interface gráfica, recomenda-se:
 * --- não pode especificar parametros
 * --- deve ter runManually = true
 * --- o nó deve especificar um mimetype e um dos aspectos
 *     especificados na mimetype e aspect constraints
 *
 * - se não for especificado, pode correr manualmente
 * - se não for especificado pelo runAs, corre com os privilégios do grupo
 */
export interface Action {
	uuid: string;
	title: string;
	description: string;
	builtIn: boolean;
	runOnCreates: boolean;
	runOnUpdates: boolean;
	runManually: boolean;
	runAs?: string;
	params: string[];

	filters: NodeFilter[];

	run: (
		ctx: RunContext,
		uuids: string[],
		params?: Record<string, string>,
	) => Promise<void | Error>;
}

export async function fileToAction(file: File): Promise<Action> {
	const url = URL.createObjectURL(file);
	const mod = await import(url);

	const raw = mod.default as Action;

	const action: Action = {
		uuid: raw.uuid ?? file.name.split(".")[0],
		title: raw.title ?? file.name.split(".")[0],
		description: raw.description ?? "",
		builtIn: false,
		filters: raw.filters ?? [],
		runOnCreates: raw.runOnCreates ?? false,
		runOnUpdates: raw.runOnUpdates ?? false,
		runManually: raw.runManually ?? true,
		params: raw.params ?? [],

		run: raw.run,
	};

	if (raw.runAs) {
		action.runAs = raw.runAs;
	}

	return action;
}

export function actionToFile(action: Action): File {
	const text = `export default {
			uuid: "${action.uuid}",
			title: "${action.title}",
			description: "${action.description}",
			builtIn: ${action.builtIn},
			filters: ${JSON.stringify(action.filters)},
			params: ${JSON.stringify(action.params)},
			runOnCreates: ${action.runOnCreates},
			runOnUpdates: ${action.runOnUpdates},
			runManually: ${action.runManually},
			${action.runAs ? 'runAs: "' + action.runAs + '",' : ""}

			async ${action.run.toString()}
		};`;

	const filename = `${action.title}.js`;
	const type = "text/javascript";

	return new File([text], filename, { type });
}

export function actionToNode(action: Action): ActionNode {
	return NodeFactory.createMetadata(
		action.uuid,
		action.uuid,
		Node.ACTION_MIMETYPE,
		0,
		action,
	) as ActionNode;
}
