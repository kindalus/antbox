export const FOLDER_MIMETYPE = "application/folder";
export const SMART_FOLDER_MIMETYPE = "application/smartfolder";
export const ROOT_FOLDER_UUID = "ROOT";

export type Properties = Record<string, unknown>;

export default interface Node extends Record<string, unknown> {
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

export interface FolderNode extends Node {
	children: string[];
	onCreate: string[];
	onUpdate: string[];
}

export interface FileNode extends Node {
	// Versões têm o formato aaaa-MM-ddTHH:mm:ss
	versions: string[];
}

export interface SmartFolderNode extends Node {
	aspectConstraints: [string];
	mimetypeConstraints: [string];
	filters: NodeFilter[];
	aggregations?: Aggregation[];
}

export type FilterOperator =
	| "=="
	| "<="
	| ">="
	| "<"
	| ">"
	| "!="
	| "in"
	| "not-in"
	| "array-contains"
	| "array-contains-any";

export type NodeFilter = [field: string, operator: FilterOperator, value: unknown];

export interface Aggregation {
	title: string;
	fieldName: string;
	formula: AggregationFormula;
}

export type AggregationFormula =
	| "sum"
	| "count"
	| "avg"
	| "med"
	| "max"
	| "min"
	| "string";

export function isFid(uuid: string): boolean {
	return uuid.startsWith("fid:");
}

export function uuidToFid(fid: string): string {
	return fid.startsWith("fid:") ? fid.substring(4) : fid;
}

export function fidToUuid(fid: string): string {
	return `fid:${fid}`;
}
