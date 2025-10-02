import { Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Constructor } from "domain/nodes/mixins.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeProperties } from "domain/nodes/node_properties.ts";

export function WithAspectMixin<TBase extends Constructor>(Base: TBase) {
	return class extends Base {
		protected _aspects: string[] = [];
		protected _properties: NodeProperties = {};
		protected _tags: string[] = [];
		protected _related: string[] = [];

		// deno-lint-ignore no-explicit-any
		constructor(...args: any[]) {
			super(...args);

			this._aspects = args[0]?.aspects ?? [];
			this._properties = args[0]?.properties ?? {};
			this._tags = args[0]?.tags ?? [];
			this._related = args[0]?.related ?? [];
		}

		get aspects(): string[] {
			return this._aspects;
		}

		get properties(): NodeProperties {
			return this._properties;
		}

		get tags(): string[] {
			return this._tags;
		}

		get related(): string[] {
			return this._related;
		}

		get metadata(): Partial<NodeMetadata> {
			return {
				...super.metadata,
				aspects: this._aspects,
				properties: this._properties,
				tags: this._tags,
				related: this._related,
			};
		}

		update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
			this._aspects = metadata.aspects ?? this._aspects;
			this._properties = (metadata.properties as NodeProperties) ??
				this._properties;
			this._tags = metadata.tags ?? this._tags;
			this._related = metadata.related ?? this._related;

			return super.update(metadata);
		}
	};
}
