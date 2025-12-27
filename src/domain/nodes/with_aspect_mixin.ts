import { Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Constructor } from "domain/nodes/mixins.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeProperties } from "domain/nodes/node_properties.ts";

export function WithAspectMixin<TBase extends Constructor>(Base: TBase) {
	return class extends Base {
		protected _aspects: string[] = [];
		protected _properties: NodeProperties = {};
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

		get related(): string[] {
			return this._related;
		}

		get metadata(): NodeMetadata {
			return {
				...super.metadata,
				aspects: this._aspects,
				properties: this._properties,
				tags: this._tags,
				related: this._related,
			};
		}

		update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
			const nextAspects = metadata.aspects ?? this._aspects;
			this._related = metadata.related ?? this._related;
			this._aspects = nextAspects;

			const shouldUpdateProperties = metadata.properties !== undefined ||
				metadata.aspects !== undefined;

			if (shouldUpdateProperties) {
				const nextProperties: NodeProperties = {};
				const baseProperties = (metadata.properties ?? this._properties) as Record<
					string,
					unknown
				>;

				for (const [key, value] of Object.entries(baseProperties)) {
					if (value === undefined) {
						continue;
					}

					const aspectPrefix = key.split(":")[0];
					if (!nextAspects.includes(aspectPrefix)) {
						continue;
					}

					nextProperties[key] = value;
				}

				this._properties = nextProperties;
			}

			return super.update(metadata as NodeMetadata);
		}
	};
}
