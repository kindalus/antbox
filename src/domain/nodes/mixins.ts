import { Either } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Permissions } from "./node.ts";
import { NodeFilter } from "./node_filter.ts";
import { NodeMetadata } from "./node_metadata.ts";
import { NodeProperties } from "./node_properties.ts";
import { Nodes } from "./nodes.ts";

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

export function FileNodeMixin<TBase extends Constructor>(Base: TBase) {
	return class extends Base {
		size: number;

		// deno-lint-ignore no-explicit-any
		constructor(...args: any[]) {
			super(...args);

			this.size = args[0]?.size ?? 0;
		}
	};
}

export function FolderNodeMixin<TBase extends Constructor>(Base: TBase) {
	return class extends Base {
		#onCreate: string[] = [];
		#onUpdate: string[] = [];
		#group: string = null as unknown as string;

		#permissions: Permissions = {
			group: ["Read", "Write", "Export"],
			authenticated: ["Read", "Export"],
			anonymous: [],
			advanced: {},
		};
		#mimetype = Nodes.FOLDER_MIMETYPE;
		#childFilters: NodeFilter[] = [];

		// deno-lint-ignore no-explicit-any
		constructor(...args: any[]) {
			super(...args);

			const metadata = args[0] as Partial<NodeMetadata>;

			this.#onCreate = metadata.onCreate ?? [];
			this.#onUpdate = metadata.onUpdate ?? [];

			if (metadata.group) {
				this.#group = metadata.group;
			}

			this.#childFilters = metadata.childFilters ?? [];
			this.#permissions = metadata.permissions ?? {
				group: ["Read", "Write", "Export"],
				authenticated: ["Read", "Export"],
				anonymous: [],
				advanced: {},
			};
		}

		update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
			this.#onCreate = metadata.onCreate ?? this.#onCreate;
			this.#onUpdate = metadata.onUpdate ?? this.#onUpdate;
			this.#group = metadata.group ?? this.#group;
			this.#childFilters = metadata.childFilters ?? this.#childFilters;
			this.#permissions = metadata.permissions ?? this.#permissions;

			return super.update(metadata);
		}
	};
}
