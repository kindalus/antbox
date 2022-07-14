export interface ActionParams {
	name: string;
	title: string;
	required: boolean;
	validationRegex?: string;
	validationList?: string[];
}

export interface Principal {
	getPrincipaName(): string;
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

export interface Aspect {
	uuid: string;
}

export type Properties = Record<string, unknown>;

export interface Node {
	uuid: string;
	fid: string;
	title: string;
	description?: string;
	mimetype: string;
	size: number;
	starred: boolean;
	trashed: boolean;
	aspects?: string[];
	parent?: string;
	createdTime: string;
	modifiedTime: string;
	owner: string;
	properties?: Properties;
}
export interface NodeFilter {}

export interface NodeFilterResult {}

export as namespace Actions;
