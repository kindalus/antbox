import { Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Constructor } from "domain/nodes/mixins.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";

export function FileMixin<TBase extends Constructor>(Base: TBase) {
	return class extends Base {
		protected _size: number;

		// deno-lint-ignore no-explicit-any
		constructor(...args: any[]) {
			super(...args);

			this._size = args[0]?.size ?? 0;
		}

		get size(): number {
			return this._size;
		}

		get metadata(): Partial<NodeMetadata> {
			return {
				...super.metadata,
				size: this._size,
			};
		}

		update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
			this._size = metadata.size ?? this._size;
			return super.update(metadata);
		}
	};
}
