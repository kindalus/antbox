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
import { z } from "zod";

const PermissionSchema = z.array(z.enum(["Read", "Write", "Export"]));

const FolderValidationSchema = z.object({
  group: z.string().min(1, "group is required"),
  permissions: z.object({
    group: PermissionSchema,
    authenticated: PermissionSchema,
    anonymous: PermissionSchema,
    advanced: z.record(z.string(), PermissionSchema),
  }),
  filters: z.array(z.unknown()),
});

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
      const result = FolderValidationSchema.safeParse({
        ...this.metadata,
        group: this.#group,
        permissions: this.#permissions,
        filters: this.#filters,
      });

      if (!result.success) {
        const errors: AntboxError[] = [];

        for (const issue of result.error.issues) {
          const fieldPath = issue.path.join(".");

          if (issue.code === "too_small" && issue.minimum === 1) {
            if (fieldPath === "group") {
              errors.push(new PropertyRequiredError("group"));
            } else if (fieldPath.startsWith("permissions.")) {
              errors.push(new PropertyRequiredError(fieldPath));
            } else {
              errors.push(new PropertyRequiredError(fieldPath));
            }
          } else if (issue.code === "invalid_type") {
            if (fieldPath.startsWith("permissions.")) {
              errors.push(
                new PropertyFormatError(
                  fieldPath,
                  "Permissions",
                  issue.message,
                ),
              );
            } else {
              errors.push(
                new PropertyFormatError(
                  fieldPath,
                  "valid format",
                  issue.message,
                ),
              );
            }
          } else {
            errors.push(
              new PropertyFormatError(
                fieldPath,
                "valid format",
                issue.message,
              ),
            );
          }
        }

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
