import { AntboxError } from "shared/antbox_error.ts";
import { Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Constructor } from "domain/nodes/mixins.ts";
import { Permissions } from "domain/nodes/node.ts";
import { NodeFilters } from "domain/nodes/node_filter.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import {
  PropertyFormatError,
  PropertyRequiredError,
} from "domain/nodes/property_errors.ts";

export function FolderMixin<TBase extends Constructor>(Base: TBase) {
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
    #filters: NodeFilters = [];

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

    get filters(): NodeFilters {
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
          new PropertyFormatError(
            "permissions.group",
            "Permissions",
            this.#permissions.group,
          ),
        );
      }

      if (!Array.isArray(this.#permissions.authenticated)) {
        errors.push(
          new PropertyFormatError(
            "permissions.authenticated",
            "Permissions",
            this.#permissions.authenticated,
          ),
        );
      }

      if (!Array.isArray(this.#permissions.anonymous)) {
        errors.push(
          new PropertyFormatError(
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
