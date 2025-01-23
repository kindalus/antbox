import { NodeMetadata } from "./node_metadata.ts";
import { NodeProperties } from "./node_properties.ts";
import { Nodes } from "./nodes.ts";

export class Node {
	readonly uuid: string;
	fid: string;
	title: string;
	description?: string;
	mimetype: string;
	parent = Nodes.ROOT_FOLDER_UUID;
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
		this.parent = metadata?.parent ?? Nodes.ROOT_FOLDER_UUID;
		this.createdTime = metadata?.createdTime ?? new Date().toISOString();
		this.modifiedTime = metadata?.modifiedTime ?? new Date().toISOString();
		this.owner = metadata?.owner ?? "";
		this.fulltext = metadata?.fulltext ?? "";
	}

	isJson(): boolean {
		return this.mimetype === "application/json";
	}

	isApikey(): boolean {
		return this.mimetype === Nodes.API_KEY_MIMETYPE;
	}

	isFolder(): boolean {
		return this.mimetype === Nodes.FOLDER_MIMETYPE;
	}

	isMetaNode(): boolean {
		return this.mimetype === Nodes.META_NODE_MIMETYPE;
	}

	isSmartFolder(): boolean {
		return this.mimetype === Nodes.SMART_FOLDER_MIMETYPE;
	}

	isRootFolder(): boolean {
		return this.uuid === Nodes.ROOT_FOLDER_UUID;
	}

	isSystemRootFolder(): boolean {
		return this.uuid === Nodes.SYSTEM_FOLDER_UUID;
	}

	isAspect(): boolean {
		return this.mimetype === Nodes.ASPECT_MIMETYPE;
	}

	isGroup(): boolean {
		return this.mimetype === Nodes.GROUP_MIMETYPE;
	}

	isUser(): boolean {
		return this.mimetype === Nodes.USER_MIMETYPE;
	}

	isAction(): boolean {
		return this.mimetype === Nodes.ACTION_MIMETYPE;
	}

	isExt(): boolean {
		return this.mimetype === Nodes.EXT_MIMETYPE;
	}

	isFormSpecification(): boolean {
		return this.mimetype === Nodes.FORM_SPECIFICATION_MIMETYPE;
	}

	isFile(): boolean {
		return false;
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
export type Constructor<T = {}> = new (...args: any[]) => T;

export function WithAspectMixin<TBase extends Constructor>(Base: TBase) {
	return class extends Base {
		aspects: string[] = [];
		properties: NodeProperties = {};

		// deno-lint-ignore no-explicit-any
		constructor(...args: any[]) {
			super(...args);

			this.aspects = args[0]?.aspects ?? [];
			this.properties = args[0]?.properties ?? {};
		}
	};
}
