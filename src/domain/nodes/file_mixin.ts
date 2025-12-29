import { Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Constructor } from "domain/nodes/mixins.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";

export function FileMixin<TBase extends Constructor>(Base: TBase) {
	return class extends Base {
		protected _size: number;
		protected _cdnUrl?: string;

		// deno-lint-ignore no-explicit-any
		constructor(...args: any[]) {
			super(...args);

			this._size = args[0]?.size ?? 0;
			this._cdnUrl = args[0]?.cdnUrl;
		}

		get size(): number {
			return this._size;
		}

		get cdnUrl(): string | undefined {
			return this._cdnUrl;
		}

		get metadata(): NodeMetadata {
			return {
				...super.metadata,
				size: this._size,
				cdnUrl: this._cdnUrl,
			};
		}

		update(metadata: NodeMetadata): Either<ValidationError, void> {
			this._size = metadata.size ?? this._size;
			this._cdnUrl = metadata.cdnUrl ?? this._cdnUrl;
			return super.update(metadata);
		}
	};
}
