import { type Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { type Permissions } from "./node.ts";
import { type AndNodeFilters, type NodeFilter, type OrNodeFilters } from "./node_filter.ts";
import { type NodeMetadata } from "./node_metadata.ts";
import { type NodeProperties } from "./node_properties.ts";
import { Nodes } from "./nodes.ts";
import { PropertyRequiredError } from "./property_required_error.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import { PropertyValueFormatError } from "./property_value_format_error.ts";

// deno-lint-ignore no-explicit-any
export type Constructor<T = any> = new (...args: any[]) => T;

export function WithAspectMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    #aspects: string[] = [];
    #properties: NodeProperties = {};
    #tags: string[] = [];
    #related: string[] = [];

    // deno-lint-ignore no-explicit-any
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
  };
}

export function FileNodeMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    #size: number;

    // deno-lint-ignore no-explicit-any
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
    #filters: AndNodeFilters | OrNodeFilters = [];

    // deno-lint-ignore no-explicit-any
    constructor(...args: any[]) {
      super({ ...args[0], mimetype: Nodes.FOLDER_MIMETYPE });

      const metadata = args[0] as Partial<NodeMetadata>;

      this.#onCreate = metadata.onCreate ?? [];
      this.#onUpdate = metadata.onUpdate ?? [];

      if (metadata.group) {
        this.#group = metadata.group;
      }

      this.#filters = metadata.filters ?? [];
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

    get filters(): AndNodeFilters | OrNodeFilters {
      return this.#filters;
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
      this.#filters = metadata.filters ?? this.#filters;
      this.#permissions = metadata.permissions ?? this.#permissions;

      return super.update(metadata);
    }

    #validate() {
      const errors: AntboxError[] = [];

      if (!this.#group || this.#group.length === 0) {
        errors.push(new PropertyRequiredError("group"));
      }

      if (!this.#permissions) {
        errors.push(new PropertyRequiredError("permissions"));
      }

      if (!this.#filters) {
        errors.push(new PropertyRequiredError("filters"));
      }

      if (!this.#permissions.group) {
        errors.push(new PropertyRequiredError("permissions.group"));
      }

      if (!this.#permissions.authenticated) {
        errors.push(new PropertyRequiredError("permissions.authenticated"));
      }

      if (!this.#permissions.anonymous) {
        errors.push(new PropertyRequiredError("permissions.anonymous"));
      }

      if (!this.#permissions.advanced) {
        errors.push(new PropertyRequiredError("permissions.advanced"));
      }

      if (!Array.isArray(this.#permissions.group)) {
        errors.push(
          new PropertyValueFormatError("permissions.group", "Permissions", this.#permissions.group),
        );
      }

      if (!Array.isArray(this.#permissions.authenticated)) {
        errors.push(
          new PropertyValueFormatError(
            "permissions.authenticated",
            "Permissions",
            this.#permissions.authenticated,
          ),
        );
      }

      if (!Array.isArray(this.#permissions.anonymous)) {
        errors.push(
          new PropertyValueFormatError(
            "permissions.anonymous",
            "Permissions",
            this.#permissions.anonymous,
          ),
        );
      }

      if (errors.length > 0) {
        throw ValidationError.from(...errors);
      }
    }

    get metadata(): Partial<NodeMetadata> {
      return {
        ...super.metadata,
        onCreate: this.#onCreate,
        onUpdate: this.#onUpdate,
        group: this.#group,
        filters: this.#filters,
        permissions: this.#permissions,
      };
    }
  };
}
