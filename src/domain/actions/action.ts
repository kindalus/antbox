import { NodeFilterResult } from "/domain/nodes/node_repository.ts";
import { Node, NodeFilter } from "/domain/nodes/node.ts";
import Aspect from "/domain/aspects/aspect.ts";
import Principal from "../auth/principal.ts";

/**
 * Representado em ficheiro js com o formato:
 *
 * export default {
 * 	uuid: string;
 * 	title: string;
 * 	description: string;
 * 	run: (ctx, params, uuids) => Promise<void>;);
 * 	builtIn: boolean;
 * 	multiple: string;
 * 	aspectConstraints: string[];
 * 	mimetypeConstraints: string[];
 * 	params: ActionParams[];
 * }
 */
export default interface Action {
	uuid: string;
	title: string;
	description: string;
	run: (
		ctx: RunContext,
		params: Record<string, unknown>,
		uuids: string[],
	) => Promise<void | Error>;
	builtIn: boolean;
	multiple: string;
	aspectConstraints: string[];
	mimetypeConstraints: string[];
	params: ActionParams[];
}
export interface ActionParams {
	name: string;
	title: string;
	type: string;
	required: boolean;
	validationRegex?: string;
	validationList?: string[];
}

export interface RunContext {
	readonly principal: Principal;
	readonly nodeService: NodeServiceForActions;
	readonly aspectService: AspectServiceForActions;
}

export interface NodeServiceForActions {
	createFile(
		principal: Principal,
		file: File,
		parent: string,
	): Promise<string>;

	createFolder(
		principal: Principal,
		title: string,
		parent: string,
	): Promise<string>;

	copy(principal: Principal, uuid: string): Promise<string>;

	updateFile(
		principal: Principal,
		uuid: string,
		file: File,
	): Promise<void>;

	delete(principal: Principal, uuid: string): Promise<void>;

	get(principal: Principal, uuid: string): Promise<Node>;

	list(
		principal: Principal,
		parent: string,
	): Promise<Node[]>;

	query(
		principal: Principal,
		constraints: NodeFilter[],
		pageSize: number,
		pageToken: number,
	): Promise<NodeFilterResult>;

	update(
		principal: Principal,
		uuid: string,
		data: Partial<Node>,
	): Promise<void>;
}

export interface AspectServiceForActions {
	get(principal: Principal, uuid: string): Promise<Aspect>;
	list(principal: Principal): Promise<Aspect[]>;
}
