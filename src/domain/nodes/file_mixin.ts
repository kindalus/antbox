import { Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Constructor } from "domain/nodes/mixins.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";

export function FileMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    #size: number;

    constructor(...args: any[]) {
      super(...args);

      this.#size = args[0]?.size ?? 0;
    }

    get size(): number {
      return this.#size;
    }

    get metadata(): Partial<NodeMetadata> {
      return {
        ...super.metadata,
        size: this.#size,
      };
    }

    update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
      this.#size = metadata.size ?? this.#size;
      return super.update(metadata);
    }
  };
}
