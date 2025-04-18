import { Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Constructor } from "domain/nodes/mixins.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeProperties } from "domain/nodes/node_properties.ts";

export function WithAspectMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    #aspects: string[] = [];
    #properties: NodeProperties = {};
    #tags: string[] = [];
    #related: string[] = [];

    constructor(...args: any[]) {
      super(...args);

      this.#aspects = args[0]?.aspects ?? [];
      this.#properties = args[0]?.properties ?? {};
      this.#tags = args[0]?.tags ?? [];
      this.#related = args[0]?.related ?? [];
    }

    get aspects(): string[] {
      return this.#aspects;
    }

    get properties(): NodeProperties {
      return this.#properties;
    }

    get tags(): string[] {
      return this.#tags;
    }

    get related(): string[] {
      return this.#related;
    }

    get metadata(): Partial<NodeMetadata> {
      return {
        ...super.metadata,
        aspects: this.#aspects,
        properties: this.#properties,
        tags: this.#tags,
        related: this.#related,
      };
    }

    update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
      this.#aspects = metadata.aspects ?? this.#aspects;
      this.#properties = (metadata.properties as NodeProperties) ??
        this.#properties;
      this.#tags = metadata.tags ?? this.#tags;
      this.#related = metadata.related ?? this.#related;

      return super.update(metadata);
    }
  };
}
