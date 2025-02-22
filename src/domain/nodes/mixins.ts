import { type Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { type Permissions } from "./node.ts";
import { type NodeFilter } from "./node_filter.ts";
import { type NodeMetadata } from "./node_metadata.ts";
import { type NodeProperties } from "./node_properties.ts";
import { Nodes } from "./nodes.ts";
import { PropertyRequiredError } from "./property_required_error.ts";

// deno-lint-ignore no-explicit-any
export type Constructor<T = any> = new (...args: any[]) => T;

export function WithAspectMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    _aspects: string[] = [];
    _properties: NodeProperties = {};
    _tags: string[] = [];
    _related: string[] = [];

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
  };
}

export function FileNodeMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    _size: number;

    // deno-lint-ignore no-explicit-any
    constructor(...args: any[]) {
      super(...args);

      this._size = args[0]?.size ?? 0;
    }

    get size(): number {
      return this._size;
    }
  };
}

export function FolderNodeMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    #onCreate: string[] = [];
    #onUpdate: string[] = [];
    #group = undefined as unknown as string;

    #permissions: Permissions = {
      group: ["Read", "Write", "Export"],
      authenticated: ["Read", "Export"],
      anonymous: [],
      advanced: {},
    };
    #childFilters: NodeFilter[] = [];

    // deno-lint-ignore no-explicit-any
    constructor(...args: any[]) {
      super({ ...args[0], mimetype: Nodes.FOLDER_MIMETYPE });

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

      this.#validate();
    }

    get group(): string {
      return this.#group;
    }

    get permissions(): Permissions {
      return this.#permissions;
    }

    get childFilters(): NodeFilter[] {
      return this.#childFilters;
    }

    get onCreate(): string[] {
      return this.#onCreate;
    }

    get onUpdate(): string[] {
      return this.#onUpdate;
    }

    update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
      this.#onCreate = metadata.onCreate ?? this.#onCreate;
      this.#onUpdate = metadata.onUpdate ?? this.#onUpdate;
      this.#childFilters = metadata.childFilters ?? this.#childFilters;
      this.#permissions = metadata.permissions ?? this.#permissions;

      return super.update(metadata);
    }

    #validate() {
      if (!this.#group || this.#group.length === 0) {
        throw ValidationError.from(new PropertyRequiredError("group"));
      }
    }
  };
}
