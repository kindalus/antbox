import { Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Constructor } from "domain/nodes/mixins.ts";
import { Permissions } from "domain/nodes/node.ts";
import { NodeFilters } from "domain/nodes/node_filter.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { z } from "zod";
import { toPropertyError } from "../validation_schemas.ts";

const PermissionSchema = z.array(z.enum(["Read", "Write", "Export"]));

const FolderValidationSchema = z.object({
	group: z.string().min(1, "group is required"),
	permissions: z.object({
		group: PermissionSchema,
		authenticated: PermissionSchema,
		anonymous: PermissionSchema,
		advanced: z.record(z.string(), PermissionSchema).optional(),
	}),
	filters: z.array(z.any()),
	onCreate: z.array(z.string()).optional(),
	onUpdate: z.array(z.string()).optional(),
	onDelete: z.array(z.string()).optional(),
});

export function FolderMixin<TBase extends Constructor>(Base: TBase) {
	return class extends Base {
		protected _onCreate: string[] = [];
		protected _onUpdate: string[] = [];
		protected _onDelete: string[] = [];
		protected _group = undefined as unknown as string;

		protected _permissions: Permissions = {
			group: ["Read", "Write", "Export"],
			authenticated: ["Read", "Export"],
			anonymous: [],
			advanced: {},
		};
		protected _filters: NodeFilters = [];

		// deno-lint-ignore no-explicit-any
		constructor(...args: any[]) {
			super({ ...args[0], mimetype: Nodes.FOLDER_MIMETYPE });

			const metadata = args[0] as Partial<NodeMetadata>;

			this._onCreate = metadata.onCreate ?? [];
			this._onUpdate = metadata.onUpdate ?? [];
			this._onDelete = metadata.onDelete ?? [];

			if (metadata.group) {
				this._group = metadata.group;
			}

			this._filters = metadata.filters ?? [];
			this._permissions = metadata.permissions ?? {
				group: ["Read", "Write", "Export"],
				authenticated: ["Read", "Export"],
				anonymous: [],
				advanced: {},
			};
		}

		get group(): string {
			return this._group;
		}

		get permissions(): Permissions {
			return this._permissions;
		}

		get filters(): NodeFilters {
			return this._filters;
		}

		get onCreate(): string[] {
			return this._onCreate;
		}

		get onUpdate(): string[] {
			return this._onUpdate;
		}

		get onDelete(): string[] {
			return this._onDelete;
		}

		update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
			this._onCreate = metadata.onCreate ?? this._onCreate;
			this._onUpdate = metadata.onUpdate ?? this._onUpdate;
			this._onDelete = metadata.onDelete ?? this._onDelete;
			this._filters = metadata.filters ?? this._filters;
			this._permissions = metadata.permissions ?? this._permissions;

			return super.update(metadata);
		}

		protected _safeValidateFolderMixin(): ValidationError | undefined {
			const result = FolderValidationSchema.safeParse(this.metadata);

			if (!result.success) {
				return ValidationError.from(
					...result.error.issues.map(toPropertyError("Node")),
				);
			}
		}

		get metadata(): Partial<NodeMetadata> {
			return {
				...super.metadata,
				onCreate: this._onCreate,
				onUpdate: this._onUpdate,
				onDelete: this._onDelete,
				group: this._group,
				filters: this._filters,
				permissions: this._permissions,
			};
		}
	};
}
