import { Folders } from "./folders.ts";
import { NodeMetadata } from "./node_metadata.ts";
import { NodeProperties } from "./node_properties.ts";

export class Node {
	readonly uuid: string;
	fid: string;
	title: string;
	description?: string;
	mimetype: string;
	parent = Folders.ROOT_FOLDER_UUID;
	readonly createdTime: string;
	modifiedTime: string;
	owner: string;
	fulltext: string;
	static USER_MIMETYPE: string | undefined;

	constructor(metadata: Partial<NodeMetadata> = {}) {
		this.mimetype = metadata?.mimetype ?? "";
		this.uuid = metadata?.uuid ?? "";
		this.fid = metadata?.fid ?? "";
		this.title = metadata?.title ?? "";
		this.description = metadata?.description;
		this.parent = metadata?.parent ?? Folders.ROOT_FOLDER_UUID;
		this.createdTime = metadata?.createdTime ?? new Date().toISOString();
		this.modifiedTime = metadata?.modifiedTime ?? new Date().toISOString();
		this.owner = metadata?.owner ?? "";
		this.fulltext = metadata?.fulltext ?? "";
	}

	isJson(): boolean {
		return this.mimetype === "application/json";
	}
}

export type Permission = "Read" | "Write" | "Export";

export type Permissions = {
	group: Permission[];
	authenticated: Permission[];
	anonymous: Permission[];
	advanced?: Record<string, Permission[]>;
};

// deno-lint-ignore no-explicit-any
export type Constructor<T = any> = new (...args: any[]) => T;

export function WithAspectMixin<TBase extends Constructor>(Base: TBase) {
	return class extends Base {
		aspects: string[] = [];
		properties: NodeProperties = {};
		tags: string[] = [];
		related: string[] = [];

		// deno-lint-ignore no-explicit-any
		constructor(...args: any[]) {
			super(...args);

			this.aspects = args[0]?.aspects ?? [];
			this.properties = args[0]?.properties ?? {};
			this.tags = args[0]?.tags ?? [];
			this.related = args[0]?.related ?? [];
		}
	};
}
