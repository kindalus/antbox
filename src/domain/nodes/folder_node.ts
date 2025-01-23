import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Constructor, Node, Permissions, WithAspectMixin } from "./node.ts";
import { NodeFilter } from "./node_filter.ts";
import { NodeMetadata } from "./node_metadata.ts";
import { Nodes } from "./nodes.ts";

export function FolderNodeMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    onCreate: string[] = [];
    onUpdate: string[] = [];
    group: string = null as unknown as string;
    uuid: string = null as unknown as string;

    permissions: Permissions = {
      group: ["Read", "Write", "Export"],
      authenticated: ["Read", "Export"],
      anonymous: [],
      advanced: {},
    };
    mimetype = Nodes.FOLDER_MIMETYPE;
    childFilters: NodeFilter[] = [];

    // deno-lint-ignore no-explicit-any
    constructor(...args: any[]) {
      super(...args);
    }

    isAspectsFolder(): boolean {
      return this.uuid === Nodes.ASPECTS_FOLDER_UUID;
    }

    isActionsFolder(): boolean {
      return this.uuid === Nodes.ACTIONS_FOLDER_UUID;
    }

    isApiKeysFolder(): boolean {
      return this.uuid === Nodes.API_KEYS_FOLDER_UUID;
    }
  };
}

export class FolderNode extends FolderNodeMixin(WithAspectMixin(Node)) {
  static create(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, FolderNode> {
    const node = new FolderNode(metadata);

    return right(node);
  }

  private constructor(metadata: Partial<NodeMetadata>) {
    super(metadata);

    this.onCreate = metadata.onCreate ?? [];
    this.onUpdate = metadata.onUpdate ?? [];

    if (metadata.group) {
      this.group = metadata.group;
    }

    this.childFilters = metadata.childFilters ?? [];
    this.permissions = metadata.permissions ?? {
      group: ["Read", "Write", "Export"],
      authenticated: ["Read", "Export"],
      anonymous: [],
      advanced: {},
    };
  }
}
